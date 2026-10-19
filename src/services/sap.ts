import { supabase } from '@/lib/supabase/client'
import { WorkspaceMember, AuditoriaOperacao, UserProfileData } from '@/types/sap'

const db = supabase as any

export const invitationService = {
  async list(workspaceId: string): Promise<any[]> {
    const { data, error } = await db
      .from('user_invitations')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  async create(dados: {
    workspace_id: string
    email: string
    perfil: 'Administrador' | 'Cliente' | 'Colaborador'
    userId?: string
  }): Promise<any> {
    const emailLimpo = dados.email.trim().toLowerCase()
    // Gera token de convite único
    const token =
      'sap_inv_' +
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    const expiraEm = new Date()
    expiraEm.setDate(expiraEm.getDate() + 7) // 7 dias de validade

    const { data, error } = await db
      .from('user_invitations')
      .insert({
        workspace_id: dados.workspace_id,
        email: emailLimpo,
        perfil: dados.perfil,
        token_hash: token,
        expira_em: expiraEm.toISOString(),
        status: 'pendente',
        convidado_por: dados.userId,
      })
      .select()
      .single()

    if (error) throw error

    await auditoriaService.registrar({
      workspace_id: dados.workspace_id,
      entidade: 'user_invitations',
      entidade_id: data.id,
      acao: 'invite_created',
      estado_posterior: data,
      created_by: dados.userId,
    })

    return data
  },

  async getByToken(token: string): Promise<any> {
    const { data, error } = await db.rpc('get_invitation_by_token', {
      token_input: token,
    })
    if (error) throw error
    return data
  },

  async aceitar(token: string): Promise<any> {
    const { data, error } = await db.rpc('accept_invitation_by_token', {
      token_input: token,
    })
    if (error) throw error
    if (data && data.sucesso === false) {
      throw new Error(data.mensagem || 'Falha ao aceitar convite')
    }
    return data
  },

  async cancelar(id: string, workspaceId: string, userId?: string): Promise<void> {
    const { data: anterior } = await db.from('user_invitations').select('*').eq('id', id).single()

    const { error } = await db
      .from('user_invitations')
      .update({ status: 'cancelado' })
      .eq('id', id)
      .eq('workspace_id', workspaceId)

    if (error) throw error

    await auditoriaService.registrar({
      workspace_id: workspaceId,
      entidade: 'user_invitations',
      entidade_id: id,
      acao: 'invite_canceled',
      estado_anterior: anterior,
      created_by: userId,
    })
  },
}

export const workspaceService = {
  async updateMemberPerfil(
    memberId: string,
    workspaceId: string,
    novoPerfil: 'Administrador' | 'Cliente' | 'Colaborador',
    userId?: string,
  ): Promise<void> {
    const { data: anterior } = await db
      .from('workspace_members')
      .select('*')
      .eq('id', memberId)
      .single()

    const { error } = await db
      .from('workspace_members')
      .update({ perfil: novoPerfil, updated_at: new Date().toISOString() })
      .eq('id', memberId)
      .eq('workspace_id', workspaceId)

    if (error) throw error

    await auditoriaService.registrar({
      workspace_id: workspaceId,
      entidade: 'workspace_members',
      entidade_id: memberId,
      acao: 'update_perfil',
      estado_anterior: anterior,
      estado_posterior: { ...anterior, perfil: novoPerfil },
      created_by: userId,
    })
  },

  async removeMember(memberId: string, workspaceId: string, userId?: string): Promise<void> {
    const { data: anterior } = await db
      .from('workspace_members')
      .select('*')
      .eq('id', memberId)
      .single()

    const { error } = await db
      .from('workspace_members')
      .delete()
      .eq('id', memberId)
      .eq('workspace_id', workspaceId)

    if (error) throw error

    await auditoriaService.registrar({
      workspace_id: workspaceId,
      entidade: 'workspace_members',
      entidade_id: memberId,
      acao: 'remove_member',
      estado_anterior: anterior,
      created_by: userId,
    })
  },

  async getWorkspacesForUser(userId: string) {
    const { data, error } = await db
      .from('workspace_members')
      .select(`
        id,
        workspace_id,
        perfil,
        status,
        workspaces (
          id,
          nome,
          owner_user_id,
          ativo,
          created_at
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'ativo')

    if (error) throw error
    return data || []
  },

  async createWorkspace(nome: string, ownerUserId: string) {
    // 1. Cria workspace
    const { data: ws, error: wsError } = await db
      .from('workspaces')
      .insert({ nome, owner_user_id: ownerUserId, ativo: true })
      .select()
      .single()

    if (wsError) throw wsError

    // 2. Cria membership de Administrador
    const { error: memError } = await db.from('workspace_members').insert({
      workspace_id: ws.id,
      user_id: ownerUserId,
      perfil: 'Administrador',
      status: 'ativo',
      accepted_at: new Date().toISOString(),
    })

    if (memError) throw memError

    // 3. Registra auditoria
    await auditoriaService.registrar({
      workspace_id: ws.id,
      entidade: 'workspaces',
      entidade_id: ws.id,
      acao: 'create',
      estado_posterior: ws,
      created_by: ownerUserId,
    })

    return ws
  },

  async getMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    // 1. Busca os membros do workspace
    const { data: members, error: memErr } = await db
      .from('workspace_members')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true })

    if (memErr) throw memErr

    if (!members || members.length === 0) {
      return []
    }

    // 2. Busca profiles dos user_ids para garantir exibição mesmo sem embed
    const userIds = Array.from(new Set(members.map((m: any) => m.user_id).filter(Boolean)))
    let profileMap: Record<string, { nome: string; email: string }> = {}

    if (userIds.length > 0) {
      try {
        const { data: profs } = await db
          .from('profiles')
          .select('id, nome, email')
          .in('id', userIds)

        for (const p of profs || []) {
          profileMap[p.id] = { nome: p.nome, email: p.email }
        }
      } catch (err) {
        console.warn('Não foi possível obter profiles complementares:', err)
      }
    }

    return (members || []).map((m: any) => {
      const p = profileMap[m.user_id]
      return {
        id: m.id,
        workspace_id: m.workspace_id,
        user_id: m.user_id,
        perfil: m.perfil,
        status: m.status,
        invited_at: m.invited_at,
        accepted_at: m.accepted_at,
        created_at: m.created_at,
        user_nome: p?.nome || m.user_nome || 'Usuário',
        user_email: p?.email || m.user_email || '',
      }
    })
  },
}

export const profileService = {
  async getProfile(userId: string): Promise<UserProfileData | null> {
    const { data, error } = await db.from('profiles').select('*').eq('id', userId).maybeSingle()

    if (error) throw error
    return data
  },

  async updateProfile(userId: string, updates: Partial<UserProfileData>) {
    const { data, error } = await db
      .from('profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single()

    if (error) throw error
    return data
  },
}

export const auditoriaService = {
  async registrar(dados: {
    workspace_id: string
    entidade: string
    entidade_id: string
    acao: string
    estado_anterior?: any
    estado_posterior?: any
    idempotency_key?: string | null
    created_by?: string | null
  }) {
    try {
      await db.from('auditoria_operacoes').insert({
        workspace_id: dados.workspace_id,
        entidade: dados.entidade,
        entidade_id: dados.entidade_id,
        acao: dados.acao,
        estado_anterior: dados.estado_anterior || null,
        estado_posterior: dados.estado_posterior || null,
        idempotency_key: dados.idempotency_key || null,
        created_by: dados.created_by || null,
      })
    } catch (err) {
      console.warn('Falha ao gravar auditoria (não-bloqueante):', err)
    }
  },

  async getHistorico(workspaceId: string, limit = 50): Promise<AuditoriaOperacao[]> {
    const { data, error } = await db
      .from('auditoria_operacoes')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return data || []
  },
}

export const permissionsService = {
  async getPermissions() {
    const { data, error } = await db
      .from('permissions')
      .select('*')
      .order('modulo', { ascending: true })

    if (error) throw error
    return data || []
  },
}

// ----------------------------------------------------
// BUILD 1: SERVIÇO DE CONTAS
// ----------------------------------------------------
export const contaService = {
  async list(workspaceId: string, incluirInativas = false): Promise<any[]> {
    let query = db
      .from('contas')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('nome', { ascending: true })

    if (!incluirInativas) {
      query = query.eq('ativa', true)
    }

    const { data, error } = await query
    if (error) throw error
    return (data || []).map((c: any) => ({
      ...c,
      saldo_inicial: Number(c.saldo_inicial || 0),
      saldo_atual: Number(c.saldo_atual || 0),
    }))
  },

  async getById(id: string): Promise<any | null> {
    const { data, error } = await db.from('contas').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    if (!data) return null
    return {
      ...data,
      saldo_inicial: Number(data.saldo_inicial || 0),
      saldo_atual: Number(data.saldo_atual || 0),
    }
  },

  async create(dados: {
    workspace_id: string
    nome: string
    tipo: string
    saldo_inicial?: number
    cor?: string
    icone?: string
    created_by?: string
  }): Promise<any> {
    const saldo = Number(dados.saldo_inicial || 0)
    const { data, error } = await db
      .from('contas')
      .insert({
        workspace_id: dados.workspace_id,
        nome: dados.nome.trim(),
        tipo: dados.tipo,
        saldo_inicial: saldo,
        saldo_atual: saldo,
        cor: dados.cor || '#17C3B2',
        icone: dados.icone || 'wallet',
        ativa: true,
        created_by: dados.created_by,
      })
      .select()
      .single()

    if (error) throw error

    // Criar meio de pagamento correspondente automaticamente
    try {
      await db.from('meios_pagamento').insert({
        workspace_id: dados.workspace_id,
        tipo: 'CONTA',
        conta_id: data.id,
        nome: data.nome,
        ativo: true,
      })
    } catch (e) {
      console.warn('Erro ao auto-criar meio de pagamento da conta:', e)
    }

    // Auditoria
    await auditoriaService.registrar({
      workspace_id: dados.workspace_id,
      entidade: 'contas',
      entidade_id: data.id,
      acao: 'create',
      estado_posterior: data,
      created_by: dados.created_by,
    })

    return data
  },

  async update(
    id: string,
    workspaceId: string,
    updates: {
      nome?: string
      tipo?: string
      cor?: string
      icone?: string
      ativa?: boolean
      saldo_atual?: number
    },
    userId?: string,
  ): Promise<any> {
    const anterior = await this.getById(id)
    const { data, error } = await db
      .from('contas')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select()
      .single()

    if (error) throw error

    // Se o nome mudou, atualiza o meio de pagamento vinculado
    if (updates.nome && updates.nome !== anterior?.nome) {
      await db
        .from('meios_pagamento')
        .update({ nome: updates.nome.trim() })
        .eq('conta_id', id)
        .eq('workspace_id', workspaceId)
    }

    await auditoriaService.registrar({
      workspace_id: workspaceId,
      entidade: 'contas',
      entidade_id: id,
      acao: 'update',
      estado_anterior: anterior,
      estado_posterior: data,
      created_by: userId,
    })

    return data
  },

  async softDelete(id: string, workspaceId: string, userId?: string): Promise<void> {
    const anterior = await this.getById(id)
    const { error } = await db
      .from('contas')
      .update({
        deleted_at: new Date().toISOString(),
        ativa: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('workspace_id', workspaceId)

    if (error) throw error

    // Inativa meios de pagamento
    await db
      .from('meios_pagamento')
      .update({ ativo: false })
      .eq('conta_id', id)
      .eq('workspace_id', workspaceId)

    await auditoriaService.registrar({
      workspace_id: workspaceId,
      entidade: 'contas',
      entidade_id: id,
      acao: 'delete',
      estado_anterior: anterior,
      created_by: userId,
    })
  },
}

// ----------------------------------------------------
// BUILD 1: SERVIÇO DE CARTÕES
// ----------------------------------------------------
export const cartaoService = {
  async list(workspaceId: string, incluirInativos = false): Promise<any[]> {
    let query = db
      .from('cartoes')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('nome', { ascending: true })

    if (!incluirInativos) {
      query = query.eq('ativo', true)
    }

    const { data, error } = await query
    if (error) throw error

    // Buscar consumo total do cartão: compras ativas pendentes (incluindo parcelas futuras)
    // O limite disponível considera o valor total comprometido (Build 2 e 3)
    const cartoes = (data || []).map((c: any) => ({
      ...c,
      limite: Number(c.limite || 0),
      fatura_atual: 0,
      total_comprometido: 0,
    }))

    try {
      // 1. Somar compras de faturas abertas
      const { data: faturas } = await db
        .from('faturas')
        .select('cartao_id, valor_total, status')
        .eq('workspace_id', workspaceId)
        .eq('status', 'aberta')

      if (faturas && faturas.length > 0) {
        const mapFaturas: Record<string, number> = {}
        for (const f of faturas) {
          mapFaturas[f.cartao_id] = (mapFaturas[f.cartao_id] || 0) + Number(f.valor_total || 0)
        }
        for (const c of cartoes) {
          if (mapFaturas[c.id]) {
            c.fatura_atual = mapFaturas[c.id]
          }
        }
      }

      // 2. Somar todos os lançamentos pendentes no cartão (todas as competências, incluindo parcelas futuras)
      const { data: lancsComprometidos } = await db
        .from('lancamentos')
        .select('cartao_id, valor, tipo')
        .eq('workspace_id', workspaceId)
        .eq('meio_pagamento_tipo', 'CARTAO')
        .eq('status_pagamento', 'pendente')
        .is('deleted_at', null)

      const mapComprometido: Record<string, number> = {}
      for (const l of lancsComprometidos || []) {
        if (l.cartao_id) {
          const v = Number(l.valor || 0)
          mapComprometido[l.cartao_id] =
            (mapComprometido[l.cartao_id] || 0) + (l.tipo === 'despesa' ? v : -v)
        }
      }

      for (const c of cartoes) {
        c.total_comprometido = Math.max(0, mapComprometido[c.id] || c.fatura_atual || 0)
      }
    } catch (e) {
      console.warn('Erro ao carregar totais de cartões:', e)
    }

    return cartoes
  },

  async getById(id: string): Promise<any | null> {
    const { data, error } = await db.from('cartoes').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    if (!data) return null
    return {
      ...data,
      limite: Number(data.limite || 0),
    }
  },

  async create(dados: {
    workspace_id: string
    nome: string
    bandeira?: string
    dia_fechamento: number
    dia_vencimento: number
    limite: number
    cor?: string
    created_by?: string
  }): Promise<any> {
    const { data, error } = await db
      .from('cartoes')
      .insert({
        workspace_id: dados.workspace_id,
        nome: dados.nome.trim(),
        bandeira: dados.bandeira || 'Outro',
        dia_fechamento: Number(dados.dia_fechamento),
        dia_vencimento: Number(dados.dia_vencimento),
        limite: Number(dados.limite || 0),
        cor: dados.cor || '#4F46E5',
        ativo: true,
        created_by: dados.created_by,
      })
      .select()
      .single()

    if (error) throw error

    // Auto-criar meio de pagamento exclusivo CARTAO
    try {
      await db.from('meios_pagamento').insert({
        workspace_id: dados.workspace_id,
        tipo: 'CARTAO',
        cartao_id: data.id,
        nome: data.nome,
        ativo: true,
      })
    } catch (e) {
      console.warn('Erro ao auto-criar meio de pagamento do cartão:', e)
    }

    await auditoriaService.registrar({
      workspace_id: dados.workspace_id,
      entidade: 'cartoes',
      entidade_id: data.id,
      acao: 'create',
      estado_posterior: data,
      created_by: dados.created_by,
    })

    return data
  },

  async update(
    id: string,
    workspaceId: string,
    updates: {
      nome?: string
      bandeira?: string
      dia_fechamento?: number
      dia_vencimento?: number
      limite?: number
      cor?: string
      ativo?: boolean
    },
    userId?: string,
  ): Promise<any> {
    const anterior = await this.getById(id)
    const { data, error } = await db
      .from('cartoes')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select()
      .single()

    if (error) throw error

    if (updates.nome && updates.nome !== anterior?.nome) {
      await db
        .from('meios_pagamento')
        .update({ nome: updates.nome.trim() })
        .eq('cartao_id', id)
        .eq('workspace_id', workspaceId)
    }

    await auditoriaService.registrar({
      workspace_id: workspaceId,
      entidade: 'cartoes',
      entidade_id: id,
      acao: 'update',
      estado_anterior: anterior,
      estado_posterior: data,
      created_by: userId,
    })

    return data
  },

  async softDelete(id: string, workspaceId: string, userId?: string): Promise<void> {
    const anterior = await this.getById(id)
    const { error } = await db
      .from('cartoes')
      .update({
        deleted_at: new Date().toISOString(),
        ativo: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('workspace_id', workspaceId)

    if (error) throw error

    await db
      .from('meios_pagamento')
      .update({ ativo: false })
      .eq('cartao_id', id)
      .eq('workspace_id', workspaceId)

    await auditoriaService.registrar({
      workspace_id: workspaceId,
      entidade: 'cartoes',
      entidade_id: id,
      acao: 'delete',
      estado_anterior: anterior,
      created_by: userId,
    })
  },
}

// ----------------------------------------------------
// BUILD 1: SERVIÇO DE MEIOS DE PAGAMENTO
// ----------------------------------------------------
export const meioPagamentoService = {
  async list(workspaceId: string): Promise<any[]> {
    const { data, error } = await db
      .from('meios_pagamento')
      .select(`
        id,
        workspace_id,
        tipo,
        conta_id,
        cartao_id,
        nome,
        ativo,
        created_at,
        contas (id, nome, tipo, saldo_atual, cor, icone),
        cartoes (id, nome, bandeira, limite, cor)
      `)
      .eq('workspace_id', workspaceId)
      .order('tipo', { ascending: true })

    if (error) throw error
    return data || []
  },

  async listDinheiroComSaldo(workspaceId: string, apenasAtivos = true): Promise<any[]> {
    let query = db
      .from('meios_pagamento')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('tipo', 'DINHEIRO')
      .order('created_at', { ascending: true })

    if (apenasAtivos) {
      query = query.eq('ativo', true)
    }

    const { data, error } = await query
    if (error) throw error

    const carteiras = data || []
    if (carteiras.length === 0) return []

    // Buscar lançamentos de DINHEIRO para computar o saldo consolidado de espécie
    // Entradas (receitas) aumentam o saldo físico, Saídas (despesas) diminuem
    const { data: lancs } = await db
      .from('lancamentos')
      .select('tipo, valor, data, status_pagamento')
      .eq('workspace_id', workspaceId)
      .eq('meio_pagamento_tipo', 'DINHEIRO')
      .is('deleted_at', null)

    let totalDinheiroGeral = 0
    for (const l of lancs || []) {
      const v = Number(l.valor || 0)
      if (l.tipo === 'receita') {
        totalDinheiroGeral += v
      } else if (l.tipo === 'despesa') {
        totalDinheiroGeral -= v
      }
    }

    // Se houver mais de uma carteira em espécie cadastrada, a primeira/principal reflete o saldo geral
    return carteiras.map((c, index) => ({
      ...c,
      saldo_atual: index === 0 ? totalDinheiroGeral : 0,
      cor: '#10B981', // Verde esmeralda característico do dinheiro/carteira
    }))
  },

  async createDinheiro(
    workspaceId: string,
    nome = 'Dinheiro em Espécie',
    userId?: string,
  ): Promise<any> {
    const { data, error } = await db
      .from('meios_pagamento')
      .insert({
        workspace_id: workspaceId,
        tipo: 'DINHEIRO',
        nome: nome.trim(),
        ativo: true,
      })
      .select()
      .single()

    if (error) throw error

    await auditoriaService.registrar({
      workspace_id: workspaceId,
      entidade: 'meios_pagamento',
      entidade_id: data.id,
      acao: 'create',
      estado_posterior: data,
      created_by: userId,
    })

    return data
  },

  async update(
    id: string,
    workspaceId: string,
    updates: { nome?: string; ativo?: boolean },
    userId?: string,
  ): Promise<any> {
    const { data: anterior } = await db
      .from('meios_pagamento')
      .select('*')
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .single()

    const { data, error } = await db
      .from('meios_pagamento')
      .update(updates)
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select()
      .single()

    if (error) throw error

    await auditoriaService.registrar({
      workspace_id: workspaceId,
      entidade: 'meios_pagamento',
      entidade_id: id,
      acao: 'update',
      estado_anterior: anterior,
      estado_posterior: data,
      created_by: userId,
    })

    return data
  },

  async toggleAtivo(
    id: string,
    workspaceId: string,
    ativo: boolean,
    userId?: string,
  ): Promise<any> {
    return this.update(id, workspaceId, { ativo }, userId)
  },
}

// ----------------------------------------------------
// BUILD 1: SERVIÇO DE CATEGORIAS E SUBCATEGORIAS
// ----------------------------------------------------
export const categoriaService = {
  async listComSubcategorias(workspaceId: string): Promise<any[]> {
    const { data: cats, error: errCats } = await db
      .from('categorias')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('nome', { ascending: true })

    if (errCats) throw errCats

    const { data: subs, error: errSubs } = await db
      .from('subcategorias')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('nome', { ascending: true })

    if (errSubs) throw errSubs

    const subMap: Record<string, any[]> = {}
    for (const s of subs || []) {
      if (!subMap[s.categoria_id]) subMap[s.categoria_id] = []
      subMap[s.categoria_id].push(s)
    }

    return (cats || []).map((c: any) => ({
      ...c,
      subcategorias: subMap[c.id] || [],
    }))
  },

  async createCategoria(dados: {
    workspace_id: string
    nome: string
    tipo: 'despesa' | 'receita'
    natureza?: 'fixa' | 'variavel'
    classificacao_gerencial?: string
    cor?: string
    icone?: string
    created_by?: string
  }): Promise<any> {
    const { data, error } = await db
      .from('categorias')
      .insert({
        workspace_id: dados.workspace_id,
        nome: dados.nome.trim(),
        tipo: dados.tipo,
        natureza: dados.natureza || 'variavel',
        classificacao_gerencial: dados.classificacao_gerencial || 'Custo de Vida',
        cor: dados.cor || '#64748B',
        icone: dados.icone || 'tag',
        ativo: true,
        created_by: dados.created_by,
      })
      .select()
      .single()

    if (error) throw error

    await auditoriaService.registrar({
      workspace_id: dados.workspace_id,
      entidade: 'categorias',
      entidade_id: data.id,
      acao: 'create',
      estado_posterior: data,
      created_by: dados.created_by,
    })

    return data
  },

  async updateCategoria(
    id: string,
    workspaceId: string,
    updates: {
      nome?: string
      tipo?: 'despesa' | 'receita'
      natureza?: 'fixa' | 'variavel'
      classificacao_gerencial?: string
      cor?: string
      icone?: string
      ativo?: boolean
    },
    userId?: string,
  ): Promise<any> {
    const { data: anterior } = await db.from('categorias').select('*').eq('id', id).single()

    const { data, error } = await db
      .from('categorias')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select()
      .single()

    if (error) throw error

    await auditoriaService.registrar({
      workspace_id: workspaceId,
      entidade: 'categorias',
      entidade_id: id,
      acao: 'update',
      estado_anterior: anterior,
      estado_posterior: data,
      created_by: userId,
    })

    return data
  },

  async softDeleteCategoria(id: string, workspaceId: string, userId?: string): Promise<void> {
    const { data: anterior } = await db.from('categorias').select('*').eq('id', id).single()

    const { error } = await db
      .from('categorias')
      .update({
        deleted_at: new Date().toISOString(),
        ativo: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('workspace_id', workspaceId)

    if (error) throw error

    // Soft delete em subcategorias vinculadas
    await db
      .from('subcategorias')
      .update({
        deleted_at: new Date().toISOString(),
        ativo: false,
        updated_at: new Date().toISOString(),
      })
      .eq('categoria_id', id)
      .eq('workspace_id', workspaceId)

    await auditoriaService.registrar({
      workspace_id: workspaceId,
      entidade: 'categorias',
      entidade_id: id,
      acao: 'delete',
      estado_anterior: anterior,
      created_by: userId,
    })
  },

  async createSubcategoria(dados: {
    workspace_id: string
    categoria_id: string
    nome: string
    observacao?: string
    created_by?: string
  }): Promise<any> {
    const { data, error } = await db
      .from('subcategorias')
      .insert({
        workspace_id: dados.workspace_id,
        categoria_id: dados.categoria_id,
        nome: dados.nome.trim(),
        observacao: dados.observacao || null,
        ativo: true,
        created_by: dados.created_by,
      })
      .select()
      .single()

    if (error) throw error

    await auditoriaService.registrar({
      workspace_id: dados.workspace_id,
      entidade: 'subcategorias',
      entidade_id: data.id,
      acao: 'create',
      estado_posterior: data,
      created_by: dados.created_by,
    })

    return data
  },

  async updateSubcategoria(
    id: string,
    workspaceId: string,
    updates: {
      nome?: string
      observacao?: string
      ativo?: boolean
    },
    userId?: string,
  ): Promise<any> {
    const { data: anterior } = await db.from('subcategorias').select('*').eq('id', id).single()

    const { data, error } = await db
      .from('subcategorias')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select()
      .single()

    if (error) throw error

    await auditoriaService.registrar({
      workspace_id: workspaceId,
      entidade: 'subcategorias',
      entidade_id: id,
      acao: 'update',
      estado_anterior: anterior,
      estado_posterior: data,
      created_by: userId,
    })

    return data
  },

  async softDeleteSubcategoria(id: string, workspaceId: string, userId?: string): Promise<void> {
    const { data: anterior } = await db.from('subcategorias').select('*').eq('id', id).single()

    const { error } = await db
      .from('subcategorias')
      .update({
        deleted_at: new Date().toISOString(),
        ativo: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('workspace_id', workspaceId)

    if (error) throw error

    await auditoriaService.registrar({
      workspace_id: workspaceId,
      entidade: 'subcategorias',
      entidade_id: id,
      acao: 'delete',
      estado_anterior: anterior,
      created_by: userId,
    })
  },

  async semearCategoriasPadrao(workspaceId: string, userId: string): Promise<number> {
    const categoriasPadrao = [
      {
        nome: 'Alimentação',
        tipo: 'despesa',
        natureza: 'variavel',
        classificacao_gerencial: 'Custo de Vida',
        cor: '#10B981',
        icone: 'utensils',
        sub: ['Supermercado', 'Restaurantes', 'Delivery / Lanches', 'Café & Padaria'],
      },
      {
        nome: 'Moradia',
        tipo: 'despesa',
        natureza: 'fixa',
        classificacao_gerencial: 'Custo de Vida',
        cor: '#3B82F6',
        icone: 'home',
        sub: [
          'Aluguel / Condomínio',
          'Energia Elétrica',
          'Água & Saneamento',
          'Internet / TV',
          'Gás',
        ],
      },
      {
        nome: 'Transporte',
        tipo: 'despesa',
        natureza: 'variavel',
        classificacao_gerencial: 'Custo de Vida',
        cor: '#8B5CF6',
        icone: 'car',
        sub: [
          'Combustível',
          'Estacionamento & Pedágio',
          'Manutenção & Seguro',
          'Aplicativos (Uber/99)',
        ],
      },
      {
        nome: 'Saúde & Cuidados',
        tipo: 'despesa',
        natureza: 'variavel',
        classificacao_gerencial: 'Custo de Vida',
        cor: '#EC4899',
        icone: 'heart-pulse',
        sub: ['Farmácia', 'Consultas & Exames', 'Plano de Saúde', 'Academia & Cuidados'],
      },
      {
        nome: 'Educação & Desenvolvimento',
        tipo: 'despesa',
        natureza: 'fixa',
        classificacao_gerencial: 'Custo de Vida',
        cor: '#F59E0B',
        icone: 'graduation-cap',
        sub: ['Escola / Faculdade', 'Cursos & Livros', 'Material Escolar'],
      },
      {
        nome: 'Lazer & Liberdade',
        tipo: 'despesa',
        natureza: 'variavel',
        classificacao_gerencial: 'Liberdade',
        cor: '#06B6D4',
        icone: 'palmtree',
        sub: ['Viagens & Passeios', 'Cinema & Streaming', 'Hobbies', 'Presentes'],
      },
      {
        nome: 'Salário & Remuneração',
        tipo: 'receita',
        natureza: 'fixa',
        classificacao_gerencial: 'Receitas Fixas',
        cor: '#059669',
        icone: 'banknote',
        sub: ['Salário Mensal', '13º & Férias', 'Pró-labore'],
      },
      {
        nome: 'Rendimentos & Extras',
        tipo: 'receita',
        natureza: 'variavel',
        classificacao_gerencial: 'Receitas Variáveis',
        cor: '#22C55E',
        icone: 'trending-up',
        sub: ['Dividendos & Juros', 'Projetos Freelance', 'Reembolsos', 'Outras Entradas'],
      },
      {
        nome: 'Acumulação de Capital',
        tipo: 'despesa',
        natureza: 'fixa',
        classificacao_gerencial: 'Acumulação de Capital',
        cor: '#6366F1',
        icone: 'piggy-bank',
        sub: ['Aportes Ações / FIIs', 'Tesouro Direto', 'Reserva de Emergência'],
      },
    ]

    let totalCriadas = 0
    for (const item of categoriasPadrao) {
      const { data: cat, error } = await db
        .from('categorias')
        .insert({
          workspace_id: workspaceId,
          nome: item.nome,
          tipo: item.tipo,
          natureza: item.natureza,
          classificacao_gerencial: item.classificacao_gerencial,
          cor: item.cor,
          icone: item.icone,
          ativo: true,
          created_by: userId,
        })
        .select()
        .single()

      if (!error && cat) {
        totalCriadas++
        if (item.sub && item.sub.length > 0) {
          const subsToInsert = item.sub.map((subNome) => ({
            workspace_id: workspaceId,
            categoria_id: cat.id,
            nome: subNome,
            ativo: true,
            created_by: userId,
          }))
          await db.from('subcategorias').insert(subsToInsert)
        }
      }
    }

    return totalCriadas
  },
}

// ----------------------------------------------------
// BUILD 1: SERVIÇO DE ORÇAMENTOS
// ----------------------------------------------------
export const orcamentoService = {
  async listByMes(workspaceId: string, anoMes: string): Promise<any[]> {
    const { data: orcs, error: errOrc } = await db
      .from('orcamentos')
      .select(`
        id,
        workspace_id,
        categoria_id,
        ano_mes,
        limite,
        created_at,
        updated_at,
        categorias (
          id,
          nome,
          tipo,
          natureza,
          classificacao_gerencial,
          cor,
          icone
        )
      `)
      .eq('workspace_id', workspaceId)
      .eq('ano_mes', anoMes)

    if (errOrc) throw errOrc

    // Calcular consumo real da categoria a partir dos lançamentos da competência
    const { data: lancs } = await db
      .from('lancamentos')
      .select('categoria_id, valor, tipo')
      .eq('workspace_id', workspaceId)
      .eq('competencia', anoMes)
      .eq('tipo', 'despesa')
      .is('deleted_at', null)

    const consumoPorCat: Record<string, number> = {}
    for (const l of lancs || []) {
      if (l.categoria_id) {
        consumoPorCat[l.categoria_id] = (consumoPorCat[l.categoria_id] || 0) + Number(l.valor || 0)
      }
    }

    return (orcs || []).map((o: any) => ({
      ...o,
      limite: Number(o.limite || 0),
      consumo_atual: consumoPorCat[o.categoria_id] || 0,
    }))
  },

  async upsert(dados: {
    workspace_id: string
    categoria_id: string
    ano_mes: string
    limite: number
    created_by?: string
  }): Promise<any> {
    const { data, error } = await db
      .from('orcamentos')
      .upsert(
        {
          workspace_id: dados.workspace_id,
          categoria_id: dados.categoria_id,
          ano_mes: dados.ano_mes,
          limite: Number(dados.limite || 0),
          created_by: dados.created_by,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'workspace_id,categoria_id,ano_mes' },
      )
      .select()
      .single()

    if (error) throw error

    await auditoriaService.registrar({
      workspace_id: dados.workspace_id,
      entidade: 'orcamentos',
      entidade_id: data.id,
      acao: 'upsert',
      estado_posterior: data,
      created_by: dados.created_by,
    })

    return data
  },

  async delete(id: string, workspaceId: string, userId?: string): Promise<void> {
    const { data: anterior } = await db.from('orcamentos').select('*').eq('id', id).single()

    const { error } = await db
      .from('orcamentos')
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId)

    if (error) throw error

    await auditoriaService.registrar({
      workspace_id: workspaceId,
      entidade: 'orcamentos',
      entidade_id: id,
      acao: 'delete',
      estado_anterior: anterior,
      created_by: userId,
    })
  },
}

// ----------------------------------------------------
// BUILD 1: SERVIÇO DE LANÇAMENTOS RÁPIDOS & CONSOLIDAÇÃO DA VISÃO GERAL
// ----------------------------------------------------
export const lancamentoRapidoService = {
  async getResumoMes(workspaceId: string, anoMes: string) {
    const { data: lancs, error } = await db
      .from('lancamentos')
      .select('id, tipo, valor, categoria_id, data, descricao, categorias(id, nome, cor, icone)')
      .eq('workspace_id', workspaceId)
      .eq('competencia', anoMes)
      .is('deleted_at', null)

    if (error) throw error

    let receitaTotal = 0
    let despesaTotal = 0
    const gastosPorCategoria: Record<string, { nome: string; cor: string; total: number }> = {}

    for (const l of lancs || []) {
      const v = Number(l.valor || 0)
      if (l.tipo === 'receita') {
        receitaTotal += v
      } else if (l.tipo === 'despesa') {
        despesaTotal += v
        const catNome = l.categorias?.nome || 'Outros'
        const catCor = l.categorias?.cor || '#64748B'
        if (!gastosPorCategoria[catNome]) {
          gastosPorCategoria[catNome] = { nome: catNome, cor: catCor, total: 0 }
        }
        gastosPorCategoria[catNome].total += v
      }
    }

    const rankingGastos = Object.values(gastosPorCategoria)
      .sort((a, b) => b.total - a.total)
      .map((g) => ({
        ...g,
        percentual: despesaTotal > 0 ? (g.total / despesaTotal) * 100 : 0,
      }))

    return {
      receitaMensal: receitaTotal,
      despesaMensal: despesaTotal,
      maioresGastos: rankingGastos,
      totalLancamentos: (lancs || []).length,
    }
  },
}

// ----------------------------------------------------
// BUILD 2: SERVIÇO DE FATURAS & PAGAMENTOS DE CARTÃO
// ----------------------------------------------------
export const faturaService = {
  // Obter competência da compra no cartão com base na data da compra e dia de fechamento
  calcularCompetenciaCartao(dataCompra: string, diaFechamento: number): string {
    const dt = new Date(dataCompra + 'T12:00:00')
    const dia = dt.getDate()
    let ano = dt.getFullYear()
    let mes = dt.getMonth() + 1 // 1 a 12

    // Se comprou no dia de fechamento ou após, cai na fatura do mês seguinte
    if (dia >= diaFechamento) {
      mes += 1
      if (mes > 12) {
        mes = 1
        ano += 1
      }
    }
    return `${ano}-${String(mes).padStart(2, '0')}`
  },

  async getFatura(workspaceId: string, cartaoId: string, competencia: string): Promise<any | null> {
    const { data, error } = await db
      .from('faturas')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('cartao_id', cartaoId)
      .eq('competencia', competencia)
      .maybeSingle()

    if (error) throw error
    return data
  },

  async getOrCreateFatura(
    workspaceId: string,
    cartaoId: string,
    competencia: string,
  ): Promise<any> {
    const existente = await this.getFatura(workspaceId, cartaoId, competencia)
    if (existente) return existente

    // Buscar dados do cartão para definir datas de fechamento e vencimento
    const cartao = await cartaoService.getById(cartaoId)
    const [anoStr, mesStr] = competencia.split('-')
    const ano = parseInt(anoStr, 10)
    const mes = parseInt(mesStr, 10)

    // Ajustar dias para o mês
    const ultDiaMes = new Date(ano, mes, 0).getDate()
    const diaFech = Math.min(cartao?.dia_fechamento || 10, ultDiaMes)
    const dataFechamento = `${ano}-${String(mes).padStart(2, '0')}-${String(diaFech).padStart(2, '0')}`

    // Vencimento pode ser no mesmo mês ou seguinte dependendo da regra do cartão
    let anoVenc = ano
    let mesVenc = mes
    if (cartao?.dia_vencimento < cartao?.dia_fechamento) {
      mesVenc += 1
      if (mesVenc > 12) {
        mesVenc = 1
        anoVenc += 1
      }
    }
    const ultDiaVenc = new Date(anoVenc, mesVenc, 0).getDate()
    const diaVenc = Math.min(cartao?.dia_vencimento || 20, ultDiaVenc)
    const dataVencimento = `${anoVenc}-${String(mesVenc).padStart(2, '0')}-${String(diaVenc).padStart(2, '0')}`

    const { data, error } = await db
      .from('faturas')
      .insert({
        workspace_id: workspaceId,
        cartao_id: cartaoId,
        competencia: competencia,
        data_fechamento: dataFechamento,
        data_vencimento: dataVencimento,
        status: 'aberta',
        valor_total: 0,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  async recalcularValorFatura(
    workspaceId: string,
    cartaoId: string,
    competencia: string,
  ): Promise<number> {
    // Busca ou cria a fatura para a competência se não existir
    await this.getOrCreateFatura(workspaceId, cartaoId, competencia)

    // Soma todos os lançamentos ativos no cartão para esta competência
    const { data: lancs, error } = await db
      .from('lancamentos')
      .select('valor, tipo')
      .eq('workspace_id', workspaceId)
      .eq('cartao_id', cartaoId)
      .eq('competencia', competencia)
      .is('deleted_at', null)

    if (error) throw error

    let total = 0
    for (const l of lancs || []) {
      if (l.tipo === 'despesa') total += Number(l.valor || 0)
      else if (l.tipo === 'receita') total -= Number(l.valor || 0) // estornos/créditos
    }

    total = Math.max(0, total)

    await db
      .from('faturas')
      .update({
        valor_total: total,
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', workspaceId)
      .eq('cartao_id', cartaoId)
      .eq('competencia', competencia)

    return total
  },

  // Retorna os dados calculados dinamicamente de uma fatura específica
  // (total de compras, pagamentos realizados, saldo devedor e lista de itens)
  async getResumoFaturaCompetencia(
    workspaceId: string,
    cartaoId: string,
    competencia: string,
  ): Promise<{
    fatura: any
    totalCompras: number
    totalPago: number
    saldoDevedor: number
    status: 'aberta' | 'fechada' | 'paga'
    itens: any[]
  }> {
    const fatura = await this.getOrCreateFatura(workspaceId, cartaoId, competencia)
    await this.recalcularValorFatura(workspaceId, cartaoId, competencia)

    // Buscar lançamentos da competência com todos os detalhes para edição/conferência
    const { data: lancs } = await db
      .from('lancamentos')
      .select(`
        id,
        descricao,
        valor,
        data,
        competencia,
        tipo,
        meio_pagamento_tipo,
        cartao_id,
        conta_origem_id,
        categoria_id,
        subcategoria_id,
        numero_parcela,
        total_parcelas,
        quantidade_parcelas,
        lancamento_pai_id,
        status_pagamento,
        observacao,
        categorias (id, nome, cor, icone),
        subcategorias (id, nome)
      `)
      .eq('workspace_id', workspaceId)
      .eq('cartao_id', cartaoId)
      .eq('competencia', competencia)
      .is('deleted_at', null)
      .order('data', { ascending: false })

    let totalCompras = 0
    for (const l of lancs || []) {
      if (l.tipo === 'despesa') totalCompras += Number(l.valor || 0)
      else if (l.tipo === 'receita') totalCompras -= Number(l.valor || 0)
    }
    totalCompras = Math.max(0, totalCompras)

    // Buscar pagamentos realizados para esta fatura
    const { data: pags } = await db
      .from('pagamentos_fatura')
      .select('valor, status')
      .eq('workspace_id', workspaceId)
      .eq('fatura_id', fatura.id)
      .eq('status', 'efetivado')

    const totalPago = (pags || []).reduce((acc: number, p: any) => acc + Number(p.valor || 0), 0)
    const saldoDevedor = Math.max(0, totalCompras - totalPago)

    // Determina status dinâmico: se pago integralmente, 'paga'; caso contrário, segue fatura.status
    const statusDinamico = totalPago >= totalCompras && totalCompras > 0 ? 'paga' : fatura.status

    return {
      fatura,
      totalCompras,
      totalPago,
      saldoDevedor,
      status: statusDinamico,
      itens: lancs || [],
    }
  },

  async listFaturasCartao(workspaceId: string, cartaoId: string): Promise<any[]> {
    const { data, error } = await db
      .from('faturas')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('cartao_id', cartaoId)
      .order('competencia', { ascending: false })

    if (error) throw error
    return (data || []).map((f: any) => ({
      ...f,
      valor_total: Number(f.valor_total || 0),
    }))
  },

  async pagarFatura(dados: {
    workspace_id: string
    fatura_id: string
    conta_id: string
    valor: number
    data_pagamento: string
    userId?: string
  }): Promise<any> {
    const { data: fatura, error: fatErr } = await db
      .from('faturas')
      .select('*, cartoes(nome)')
      .eq('id', dados.fatura_id)
      .single()

    if (fatErr || !fatura) throw new Error('Fatura não encontrada')

    const valorNum = Number(dados.valor)
    if (valorNum <= 0) throw new Error('Valor do pagamento deve ser maior que zero')

    // 1. Debitar conta bancária
    const conta = await contaService.getById(dados.conta_id)
    if (!conta) throw new Error('Conta bancária não encontrada')
    const novoSaldo = Number(conta.saldo_atual) - valorNum

    await db
      .from('contas')
      .update({
        saldo_atual: novoSaldo,
        updated_at: new Date().toISOString(),
      })
      .eq('id', dados.conta_id)

    // 2. Registrar pagamento da fatura
    const { data: pag, error: pagErr } = await db
      .from('pagamentos_fatura')
      .insert({
        workspace_id: dados.workspace_id,
        fatura_id: dados.fatura_id,
        conta_id: dados.conta_id,
        valor: valorNum,
        data_pagamento: dados.data_pagamento,
        status: 'efetivado',
        created_by: dados.userId,
      })
      .select()
      .single()

    if (pagErr) throw pagErr

    // 3. Registrar movimentação de saída na conta bancária
    await db.from('movimentacoes_conta').insert({
      workspace_id: dados.workspace_id,
      conta_id: dados.conta_id,
      pagamento_fatura_id: pag.id,
      tipo: 'saida',
      valor: valorNum,
      data: dados.data_pagamento,
      descricao: `Pagamento fatura ${fatura.cartoes?.nome || 'Cartão'} (${fatura.competencia})`,
      created_by: dados.userId,
    })

    // 4. Atualizar status da fatura para 'paga'
    await db
      .from('faturas')
      .update({
        status: 'paga',
        updated_at: new Date().toISOString(),
      })
      .eq('id', dados.fatura_id)

    // 5. Auditoria
    await auditoriaService.registrar({
      workspace_id: dados.workspace_id,
      entidade: 'faturas',
      entidade_id: dados.fatura_id,
      acao: 'pay_invoice',
      estado_anterior: fatura,
      estado_posterior: { ...fatura, status: 'paga', pagamento_id: pag.id },
      created_by: dados.userId,
    })

    return pag
  },

  async estornarPagamentoFatura(
    faturaId: string,
    workspaceId: string,
    userId?: string,
  ): Promise<void> {
    const { data: fatura } = await db
      .from('faturas')
      .select('*')
      .eq('id', faturaId)
      .eq('workspace_id', workspaceId)
      .single()

    if (!fatura) throw new Error('Fatura não encontrada')

    // Buscar pagamentos efetivados desta fatura
    const { data: pags } = await db
      .from('pagamentos_fatura')
      .select('*')
      .eq('fatura_id', faturaId)
      .eq('status', 'efetivado')

    for (const pag of pags || []) {
      // Estorna saldo na conta bancária
      const conta = await contaService.getById(pag.conta_id)
      if (conta) {
        await db
          .from('contas')
          .update({
            saldo_atual: Number(conta.saldo_atual) + Number(pag.valor),
            updated_at: new Date().toISOString(),
          })
          .eq('id', pag.conta_id)
      }

      // Atualiza pagamento para 'estornado'
      await db
        .from('pagamentos_fatura')
        .update({ status: 'estornado', updated_at: new Date().toISOString() })
        .eq('id', pag.id)

      // Registra movimentação de estorno na conta
      await db.from('movimentacoes_conta').insert({
        workspace_id: workspaceId,
        conta_id: pag.conta_id,
        pagamento_fatura_id: pag.id,
        tipo: 'estorno',
        valor: Number(pag.valor),
        data: new Date().toISOString().split('T')[0],
        descricao: `Estorno de pagamento de fatura (${fatura.competencia})`,
        created_by: userId,
      })
    }

    // Reabre a fatura
    await db
      .from('faturas')
      .update({
        status: 'aberta',
        updated_at: new Date().toISOString(),
      })
      .eq('id', faturaId)

    await auditoriaService.registrar({
      workspace_id: workspaceId,
      entidade: 'faturas',
      entidade_id: faturaId,
      acao: 'reverse_invoice_payment',
      estado_anterior: fatura,
      estado_posterior: { ...fatura, status: 'aberta' },
      created_by: userId,
    })
  },
}

// ----------------------------------------------------
// BUILD 2: SERVIÇO PRINCIPAL DE LANÇAMENTOS
// ----------------------------------------------------
export const lancamentoService = {
  async list(
    workspaceId: string,
    filtros: {
      competencia?: string
      dataInicio?: string
      dataFim?: string
      dataEspecifica?: string
      tipo?: string
      contaId?: string
      cartaoId?: string
      categoriaId?: string
      statusPagamento?: string
      conciliado?: boolean | null
      busca?: string
    } = {},
  ): Promise<any[]> {
    let query = db
      .from('lancamentos')
      .select(`
        *,
        categorias (id, nome, cor, icone, tipo),
        subcategorias (id, nome),
        conta_origem:contas!lancamentos_conta_origem_id_fkey (id, nome, tipo, cor, icone),
        conta_destino:contas!lancamentos_conta_destino_id_fkey (id, nome, tipo, cor, icone),
        cartoes (id, nome, bandeira, limite, cor, dia_fechamento, dia_vencimento)
      `)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })

    if (filtros.dataEspecifica) {
      query = query.eq('data', filtros.dataEspecifica)
    } else {
      if (filtros.dataInicio) {
        query = query.gte('data', filtros.dataInicio)
      }
      if (filtros.dataFim) {
        query = query.lte('data', filtros.dataFim)
      }
      if (filtros.competencia && !filtros.dataInicio && !filtros.dataFim) {
        query = query.eq('competencia', filtros.competencia)
      }
    }
    if (filtros.tipo && filtros.tipo !== 'todos') {
      query = query.eq('tipo', filtros.tipo)
    }
    if (filtros.contaId && filtros.contaId !== 'todas') {
      query = query.or(
        `conta_origem_id.eq.${filtros.contaId},conta_destino_id.eq.${filtros.contaId}`,
      )
    }
    if (filtros.cartaoId && filtros.cartaoId !== 'todos') {
      query = query.eq('cartao_id', filtros.cartaoId)
    }
    if (filtros.categoriaId && filtros.categoriaId !== 'todas') {
      query = query.eq('categoria_id', filtros.categoriaId)
    }
    if (filtros.statusPagamento && filtros.statusPagamento !== 'todos') {
      query = query.eq('status_pagamento', filtros.statusPagamento)
    }
    if (filtros.conciliado !== undefined && filtros.conciliado !== null) {
      query = query.eq('conciliado', filtros.conciliado)
    }
    if (filtros.busca && filtros.busca.trim() !== '') {
      query = query.ilike('descricao', `%${filtros.busca.trim()}%`)
    }

    const { data, error } = await query
    if (error) throw error

    return (data || []).map((l: any) => ({
      ...l,
      valor: Number(l.valor || 0),
      categoria: l.categorias,
      subcategoria: l.subcategorias,
      conta_origem: l.conta_origem,
      conta_destino: l.conta_destino,
      cartao: l.cartoes,
    }))
  },

  async getById(id: string): Promise<any | null> {
    const { data, error } = await db
      .from('lancamentos')
      .select(`
        *,
        categorias (id, nome, cor, icone),
        subcategorias (id, nome),
        conta_origem:contas!lancamentos_conta_origem_id_fkey (id, nome, tipo),
        conta_destino:contas!lancamentos_conta_destino_id_fkey (id, nome, tipo),
        cartoes (id, nome, bandeira)
      `)
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!data) return null
    return {
      ...data,
      valor: Number(data.valor || 0),
    }
  },

  async create(dados: {
    workspace_id: string
    tipo: 'despesa' | 'receita' | 'transferencia'
    regime?: 'unico' | 'fixo' | 'parcelado'
    data: string
    descricao: string
    valor: number
    meio_pagamento_tipo: 'CONTA' | 'CARTAO' | 'DINHEIRO'
    conta_origem_id?: string | null
    conta_destino_id?: string | null
    cartao_id?: string | null
    categoria_id?: string | null
    subcategoria_id?: string | null
    status_pagamento?: 'pago' | 'pendente'
    data_pagamento?: string | null
    observacao?: string | null
    quantidade_parcelas?: number
    created_by?: string
  }): Promise<any> {
    const valorNum = Number(dados.valor)
    if (valorNum <= 0) throw new Error('O valor do lançamento deve ser maior que zero')

    const qtdParcelas = Math.max(1, Math.floor(Number(dados.quantidade_parcelas || 1)))
    const ehParcelado =
      qtdParcelas > 1 && dados.meio_pagamento_tipo === 'CARTAO' && dados.tipo === 'despesa'

    // Determinar competência base da 1ª parcela / lançamento único:
    let competenciaInicial = dados.data.substring(0, 7) // 'YYYY-MM'
    let cartaoObj: any = null
    if (dados.meio_pagamento_tipo === 'CARTAO' && dados.cartao_id) {
      cartaoObj = await cartaoService.getById(dados.cartao_id)
      if (cartaoObj) {
        competenciaInicial = faturaService.calcularCompetenciaCartao(
          dados.data,
          cartaoObj.dia_fechamento,
        )
      }
    }

    // Se NÃO for parcelado no cartão, segue fluxo simples
    if (!ehParcelado) {
      const statusFinal =
        dados.meio_pagamento_tipo === 'CARTAO' ? 'pendente' : dados.status_pagamento || 'pago'

      const dataPagamentoFinal = statusFinal === 'pago' ? dados.data_pagamento || dados.data : null

      const { data: lanc, error } = await db
        .from('lancamentos')
        .insert({
          workspace_id: dados.workspace_id,
          tipo: dados.tipo,
          regime: dados.regime || 'unico',
          data: dados.data,
          competencia: competenciaInicial,
          descricao: dados.descricao.trim(),
          valor: valorNum,
          meio_pagamento_tipo: dados.meio_pagamento_tipo,
          conta_origem_id: dados.conta_origem_id || null,
          conta_destino_id: dados.conta_destino_id || null,
          cartao_id: dados.cartao_id || null,
          categoria_id: dados.categoria_id || null,
          subcategoria_id: dados.subcategoria_id || null,
          status_pagamento: statusFinal,
          data_pagamento: dataPagamentoFinal,
          observacao: dados.observacao || null,
          quantidade_parcelas: 1,
          numero_parcela: 1,
          total_parcelas: 1,
          conciliado: false,
          created_by: dados.created_by,
        })
        .select()
        .single()

      if (error) throw error

      if (dados.meio_pagamento_tipo === 'CARTAO' && dados.cartao_id) {
        await faturaService.getOrCreateFatura(
          dados.workspace_id,
          dados.cartao_id,
          competenciaInicial,
        )
        await faturaService.recalcularValorFatura(
          dados.workspace_id,
          dados.cartao_id,
          competenciaInicial,
        )
      }

      if (statusFinal === 'pago') {
        if (dados.tipo === 'despesa' && dados.conta_origem_id) {
          const c = await contaService.getById(dados.conta_origem_id)
          if (c) {
            await db
              .from('contas')
              .update({
                saldo_atual: Number(c.saldo_atual) - valorNum,
                updated_at: new Date().toISOString(),
              })
              .eq('id', dados.conta_origem_id)

            await db.from('movimentacoes_conta').insert({
              workspace_id: dados.workspace_id,
              conta_id: dados.conta_origem_id,
              lancamento_id: lanc.id,
              tipo: 'saida',
              valor: valorNum,
              data: dados.data,
              descricao: dados.descricao,
              created_by: dados.created_by,
            })
          }
        } else if (dados.tipo === 'receita' && dados.conta_origem_id) {
          const c = await contaService.getById(dados.conta_origem_id)
          if (c) {
            await db
              .from('contas')
              .update({
                saldo_atual: Number(c.saldo_atual) + valorNum,
                updated_at: new Date().toISOString(),
              })
              .eq('id', dados.conta_origem_id)

            await db.from('movimentacoes_conta').insert({
              workspace_id: dados.workspace_id,
              conta_id: dados.conta_origem_id,
              lancamento_id: lanc.id,
              tipo: 'entrada',
              valor: valorNum,
              data: dados.data,
              descricao: dados.descricao,
              created_by: dados.created_by,
            })
          }
        } else if (
          dados.tipo === 'transferencia' &&
          dados.conta_origem_id &&
          dados.conta_destino_id
        ) {
          const cOrigem = await contaService.getById(dados.conta_origem_id)
          const cDestino = await contaService.getById(dados.conta_destino_id)
          if (cOrigem && cDestino) {
            await db
              .from('contas')
              .update({
                saldo_atual: Number(cOrigem.saldo_atual) - valorNum,
                updated_at: new Date().toISOString(),
              })
              .eq('id', dados.conta_origem_id)

            await db
              .from('contas')
              .update({
                saldo_atual: Number(cDestino.saldo_atual) + valorNum,
                updated_at: new Date().toISOString(),
              })
              .eq('id', dados.conta_destino_id)

            await db.from('movimentacoes_conta').insert([
              {
                workspace_id: dados.workspace_id,
                conta_id: dados.conta_origem_id,
                lancamento_id: lanc.id,
                tipo: 'transferencia_saida',
                valor: valorNum,
                data: dados.data,
                descricao: `Transf. saída para ${cDestino.nome}`,
                created_by: dados.created_by,
              },
              {
                workspace_id: dados.workspace_id,
                conta_id: dados.conta_destino_id,
                lancamento_id: lanc.id,
                tipo: 'transferencia_entrada',
                valor: valorNum,
                data: dados.data,
                descricao: `Transf. entrada de ${cOrigem.nome}`,
                created_by: dados.created_by,
              },
            ])
          }
        }
      }

      await auditoriaService.registrar({
        workspace_id: dados.workspace_id,
        entidade: 'lancamentos',
        entidade_id: lanc.id,
        acao: 'create',
        estado_posterior: lanc,
        created_by: dados.created_by,
      })

      return lanc
    }

    // ==========================================
    // PARCELAMENTO NO CARTÃO (BUILD 3):
    // 1. Dividir valor em parcelas com centavos residuais na última
    // 2. Criar série de lançamentos para competências consecutivas
    // 3. Criar registro na tabela 'parcelas'
    // 4. Recalcular faturas de todas as competências envolvidas
    // ==========================================
    const valorParcelaBase = Math.floor((valorNum / qtdParcelas) * 100) / 100
    const diferencaCentavos = Math.round((valorNum - valorParcelaBase * qtdParcelas) * 100) / 100

    // Função auxiliar para somar meses a uma competência YYYY-MM
    const somarMesesCompetencia = (comp: string, meses: number): string => {
      const [anoStr, mesStr] = comp.split('-')
      let a = parseInt(anoStr, 10)
      let m = parseInt(mesStr, 10) + meses
      while (m > 12) {
        m -= 12
        a += 1
      }
      return `${a}-${String(m).padStart(2, '0')}`
    }

    // 1. Cria o lançamento pai (representante do total da compra)
    const { data: lancPai, error: paiErr } = await db
      .from('lancamentos')
      .insert({
        workspace_id: dados.workspace_id,
        tipo: 'despesa',
        regime: 'parcelado',
        data: dados.data,
        competencia: competenciaInicial,
        descricao: `${dados.descricao.trim()} (1/${qtdParcelas})`,
        valor: Number((valorParcelaBase + (qtdParcelas === 1 ? diferencaCentavos : 0)).toFixed(2)),
        meio_pagamento_tipo: 'CARTAO',
        cartao_id: dados.cartao_id,
        categoria_id: dados.categoria_id || null,
        subcategoria_id: dados.subcategoria_id || null,
        status_pagamento: 'pendente',
        observacao: dados.observacao || null,
        quantidade_parcelas: qtdParcelas,
        numero_parcela: 1,
        total_parcelas: qtdParcelas,
        conciliado: false,
        created_by: dados.created_by,
      })
      .select()
      .single()

    if (paiErr) throw paiErr

    // Vincula o pai a si mesmo como raiz
    await db.from('lancamentos').update({ lancamento_pai_id: lancPai.id }).eq('id', lancPai.id)

    // Cria a 1ª parcela na tabela parcelas
    await db.from('parcelas').insert({
      workspace_id: dados.workspace_id,
      lancamento_id: lancPai.id,
      numero_parcela: 1,
      total_parcelas: qtdParcelas,
      valor: lancPai.valor,
      competencia: competenciaInicial,
      data_vencimento: dados.data,
    })

    const competenciasAfetadas = new Set<string>([competenciaInicial])

    // Cria as parcelas 2 a N como lançamentos filhos
    for (let p = 2; p <= qtdParcelas; p++) {
      const compParcela = somarMesesCompetencia(competenciaInicial, p - 1)
      competenciasAfetadas.add(compParcela)

      const valorDestaParcela =
        p === qtdParcelas
          ? Number((valorParcelaBase + diferencaCentavos).toFixed(2))
          : valorParcelaBase

      const { data: lancFilho, error: filhoErr } = await db
        .from('lancamentos')
        .insert({
          workspace_id: dados.workspace_id,
          tipo: 'despesa',
          regime: 'parcelado',
          data: dados.data,
          competencia: compParcela,
          descricao: `${dados.descricao.trim()} (${p}/${qtdParcelas})`,
          valor: valorDestaParcela,
          meio_pagamento_tipo: 'CARTAO',
          cartao_id: dados.cartao_id,
          categoria_id: dados.categoria_id || null,
          subcategoria_id: dados.subcategoria_id || null,
          status_pagamento: 'pendente',
          observacao: dados.observacao || null,
          quantidade_parcelas: qtdParcelas,
          numero_parcela: p,
          total_parcelas: qtdParcelas,
          lancamento_pai_id: lancPai.id,
          conciliado: false,
          created_by: dados.created_by,
        })
        .select()
        .single()

      if (!filhoErr && lancFilho) {
        await db.from('parcelas').insert({
          workspace_id: dados.workspace_id,
          lancamento_id: lancFilho.id,
          numero_parcela: p,
          total_parcelas: qtdParcelas,
          valor: valorDestaParcela,
          competencia: compParcela,
          data_vencimento: dados.data,
        })
      }
    }

    // Recalcular faturas de cada competência afetada
    if (dados.cartao_id) {
      for (const comp of Array.from(competenciasAfetadas)) {
        await faturaService.getOrCreateFatura(dados.workspace_id, dados.cartao_id, comp)
        await faturaService.recalcularValorFatura(dados.workspace_id, dados.cartao_id, comp)
      }
    }

    await auditoriaService.registrar({
      workspace_id: dados.workspace_id,
      entidade: 'lancamentos',
      entidade_id: lancPai.id,
      acao: 'create_installment_series',
      estado_posterior: {
        pai_id: lancPai.id,
        total_parcelas: qtdParcelas,
        valor_total: valorNum,
        competencia_inicial: competenciaInicial,
      },
      created_by: dados.created_by,
    })

    return lancPai
  },

  // Retorna todas as parcelas pertencentes à série do lançamento informado
  async getSerieParcelas(lancamentoId: string, workspaceId: string): Promise<any[]> {
    const lanc = await this.getById(lancamentoId)
    if (!lanc) return []

    const paiId = lanc.lancamento_pai_id || lanc.id

    const { data, error } = await db
      .from('lancamentos')
      .select('*')
      .eq('workspace_id', workspaceId)
      .or(`id.eq.${paiId},lancamento_pai_id.eq.${paiId}`)
      .is('deleted_at', null)
      .order('numero_parcela', { ascending: true })

    if (error) throw error
    return data || []
  },

  // Excluir com escopo: 'este' | 'este_e_proximos' | 'todos'
  async deleteComEscopo(
    lancamentoId: string,
    workspaceId: string,
    escopo: 'este' | 'este_e_proximos' | 'todos',
    userId?: string,
  ): Promise<{ excluidos: number; faturasRecalculadas: string[] }> {
    const atual = await this.getById(lancamentoId)
    if (!atual) throw new Error('Lançamento não encontrado')

    const serieCompleta = await this.getSerieParcelas(lancamentoId, workspaceId)
    const ehSerie = serieCompleta.length > 1

    let alvos: any[] = []
    if (!ehSerie || escopo === 'este') {
      alvos = [atual]
    } else if (escopo === 'todos') {
      alvos = serieCompleta
    } else if (escopo === 'este_e_proximos') {
      const numAtual = atual.numero_parcela || 1
      alvos = serieCompleta.filter((l) => (l.numero_parcela || 1) >= numAtual)
    }

    // Validação de faturas pagas: se alguma parcela alvo estiver em fatura paga, bloqueia
    for (const l of alvos) {
      if (l.cartao_id && l.competencia) {
        const fatura = await faturaService.getFatura(workspaceId, l.cartao_id, l.competencia)
        if (fatura && fatura.status === 'paga') {
          throw new Error(
            `A fatura de ${fatura.competencia} já está paga e contém a parcela (${l.numero_parcela || 1}/${l.total_parcelas || 1}). Para excluir este lançamento, desfaça o pagamento da fatura de ${fatura.competencia} na tela de Cartões.`,
          )
        }
      }
    }

    // Coletar faturas afetadas para recálculo posterior
    const faturasParaRecalcular = new Map<string, string>() // competencia -> cartao_id
    const idsAlvo = alvos.map((l) => l.id)

    for (const l of alvos) {
      if (l.cartao_id && l.competencia) {
        faturasParaRecalcular.set(l.competencia, l.cartao_id)
      }
      // Reverter saldos de conta se estava pago (fora de cartão)
      if (l.status_pagamento === 'pago') {
        const v = Number(l.valor)
        if (l.tipo === 'despesa' && l.conta_origem_id) {
          const c = await contaService.getById(l.conta_origem_id)
          if (c) {
            await db
              .from('contas')
              .update({ saldo_atual: Number(c.saldo_atual) + v })
              .eq('id', l.conta_origem_id)
          }
        } else if (l.tipo === 'receita' && l.conta_origem_id) {
          const c = await contaService.getById(l.conta_origem_id)
          if (c) {
            await db
              .from('contas')
              .update({ saldo_atual: Number(c.saldo_atual) - v })
              .eq('id', l.conta_origem_id)
          }
        }
        await db.from('movimentacoes_conta').delete().eq('lancamento_id', l.id)
      }
    }

    // Efetuar soft delete nos alvos
    const { error: delErr } = await db
      .from('lancamentos')
      .update({
        deleted_at: new Date().toISOString(),
        status_pagamento: 'cancelado',
        updated_at: new Date().toISOString(),
      })
      .in('id', idsAlvo)
      .eq('workspace_id', workspaceId)

    if (delErr) throw delErr

    // Limpar tabela parcelas dos ids
    await db.from('parcelas').delete().in('lancamento_id', idsAlvo)

    // Recalcular TODAS as faturas implicadas
    const recalcs: string[] = []
    for (const [comp, cartaoId] of faturasParaRecalcular.entries()) {
      await faturaService.recalcularValorFatura(workspaceId, cartaoId, comp)
      recalcs.push(comp)
    }

    await auditoriaService.registrar({
      workspace_id: workspaceId,
      entidade: 'lancamentos',
      entidade_id: lancamentoId,
      acao: 'delete_with_scope',
      estado_posterior: {
        escopo,
        alvos_excluidos: idsAlvo.length,
        faturas_recalculadas: recalcs,
      },
      created_by: userId,
    })

    return { excluidos: idsAlvo.length, faturasRecalculadas: recalcs }
  },

  // Alterar com escopo: 'este' | 'este_e_proximos' | 'todos'
  async updateComEscopo(
    lancamentoId: string,
    workspaceId: string,
    escopo: 'este' | 'este_e_proximos' | 'todos',
    novosDados: {
      descricao?: string
      valor?: number
      data?: string
      categoria_id?: string | null
      subcategoria_id?: string | null
      observacao?: string | null
    },
    userId?: string,
  ): Promise<{ alterados: number; faturasRecalculadas: string[] }> {
    const atual = await this.getById(lancamentoId)
    if (!atual) throw new Error('Lançamento não encontrado')

    const serieCompleta = await this.getSerieParcelas(lancamentoId, workspaceId)
    const ehSerie = serieCompleta.length > 1

    let alvos: any[] = []
    if (!ehSerie || escopo === 'este') {
      alvos = [atual]
    } else if (escopo === 'todos') {
      alvos = serieCompleta
    } else if (escopo === 'este_e_proximos') {
      const numAtual = atual.numero_parcela || 1
      alvos = serieCompleta.filter((l) => (l.numero_parcela || 1) >= numAtual)
    }

    // 1. Validar faturas pagas: verificar se alguma parcela implicada está em fatura já paga
    for (const l of alvos) {
      if (l.cartao_id && l.competencia) {
        const fatura = await faturaService.getFatura(workspaceId, l.cartao_id, l.competencia)
        if (fatura && fatura.status === 'paga') {
          throw new Error(
            `A fatura de ${fatura.competencia} já está paga e contém a parcela (${l.numero_parcela || 1}/${l.total_parcelas || 1}). Para alterar este lançamento, desfaça o pagamento da fatura de ${fatura.competencia} na tela de Cartões para prosseguir.`,
          )
        }
      }
    }

    // Mapa de faturas implicadas para recálculo
    const faturasParaRecalcular = new Map<string, string>() // competencia -> cartao_id
    for (const l of alvos) {
      if (l.cartao_id && l.competencia) {
        faturasParaRecalcular.set(l.competencia, l.cartao_id)
      }
    }

    // 2. Se a data foi alterada, recalcular a competência de cada parcela alvo a partir da nova data base
    let cartaoObj: any = null
    if (atual.cartao_id) {
      cartaoObj = await cartaoService.getById(atual.cartao_id)
    }

    const diaFechamento = cartaoObj?.dia_fechamento || 10
    const novaDataBase = novosDados.data || atual.data

    const somarMeses = (comp: string, meses: number): string => {
      const [anoStr, mesStr] = comp.split('-')
      let a = parseInt(anoStr, 10)
      let m = parseInt(mesStr, 10) + meses
      while (m > 12) {
        m -= 12
        a += 1
      }
      return `${a}-${String(m).padStart(2, '0')}`
    }

    // Se mudou a data e for escopo 'todos', a competência inicial é recalculada para a parcela 1
    // Se for 'este', recalcula para a data específica deste
    // Se for 'este_e_proximos', a partir do número da parcela atual
    const compInicialNova = atual.cartao_id
      ? faturaService.calcularCompetenciaCartao(novaDataBase, diaFechamento)
      : novaDataBase.substring(0, 7)

    for (const l of alvos) {
      let novaComp = l.competencia
      let novaDataParcela = l.data

      if (novosDados.data) {
        if (escopo === 'este' || !ehSerie) {
          novaDataParcela = novosDados.data
          novaComp = atual.cartao_id
            ? faturaService.calcularCompetenciaCartao(novosDados.data, diaFechamento)
            : novosDados.data.substring(0, 7)
        } else if (escopo === 'todos') {
          const idx = (l.numero_parcela || 1) - 1
          novaDataParcela = novosDados.data
          novaComp = somarMeses(compInicialNova, idx)
        } else if (escopo === 'este_e_proximos') {
          const numAtual = atual.numero_parcela || 1
          const offsetMeses = (l.numero_parcela || 1) - numAtual
          novaDataParcela = novosDados.data
          novaComp = somarMeses(compInicialNova, offsetMeses)
        }
      }

      // Adicionar nova competência à lista de recálculos
      if (l.cartao_id && novaComp) {
        faturasParaRecalcular.set(novaComp, l.cartao_id)
      }

      // Montar campos para atualização
      const updatesItem: any = {
        updated_at: new Date().toISOString(),
      }

      if (novosDados.descricao !== undefined) {
        // Preserva o sufixo (x/y) se for série parcelada
        if (ehSerie && l.total_parcelas) {
          const descBase = novosDados.descricao.replace(/\s*\(\d+\/\d+\)$/, '').trim()
          updatesItem.descricao = `${descBase} (${l.numero_parcela}/${l.total_parcelas})`
        } else {
          updatesItem.descricao = novosDados.descricao.trim()
        }
      }

      if (novosDados.valor !== undefined) {
        updatesItem.valor = Number(novosDados.valor)
      }

      if (novosDados.categoria_id !== undefined) {
        updatesItem.categoria_id = novosDados.categoria_id || null
      }

      if (novosDados.subcategoria_id !== undefined) {
        updatesItem.subcategoria_id = novosDados.subcategoria_id || null
      }

      if (novosDados.observacao !== undefined) {
        updatesItem.observacao = novosDados.observacao || null
      }

      if (novosDados.data) {
        updatesItem.data = novaDataParcela
        updatesItem.competencia = novaComp
      }

      await db
        .from('lancamentos')
        .update(updatesItem)
        .eq('id', l.id)
        .eq('workspace_id', workspaceId)

      // Se existir na tabela parcelas, atualiza valor/competência
      if (novosDados.valor !== undefined || novosDados.data) {
        await db
          .from('parcelas')
          .update({
            valor: updatesItem.valor !== undefined ? updatesItem.valor : l.valor,
            competencia:
              updatesItem.competencia !== undefined ? updatesItem.competencia : l.competencia,
          })
          .eq('lancamento_id', l.id)
      }
    }

    // 3. Recalcular TODAS as faturas implicadas (antigas e novas)
    const recalcs: string[] = []
    for (const [comp, cartaoId] of faturasParaRecalcular.entries()) {
      await faturaService.getOrCreateFatura(workspaceId, cartaoId, comp)
      await faturaService.recalcularValorFatura(workspaceId, cartaoId, comp)
      recalcs.push(comp)
    }

    await auditoriaService.registrar({
      workspace_id: workspaceId,
      entidade: 'lancamentos',
      entidade_id: lancamentoId,
      acao: 'update_with_scope',
      estado_posterior: {
        escopo,
        alvos_alterados: alvos.length,
        faturas_recalculadas: recalcs,
      },
      created_by: userId,
    })

    return { alterados: alvos.length, faturasRecalculadas: recalcs }
  },

  // Excluir série completa ou parcela individual (mantido para compatibilidade)
  async softDeleteSerie(
    lancamentoPaiId: string,
    workspaceId: string,
    userId?: string,
  ): Promise<void> {
    await this.deleteComEscopo(lancamentoPaiId, workspaceId, 'todos', userId)
  },

  async update(
    id: string,
    workspaceId: string,
    updates: {
      descricao?: string
      valor?: number
      data?: string
      categoria_id?: string | null
      subcategoria_id?: string | null
      status_pagamento?: 'pago' | 'pendente'
      observacao?: string | null
      conta_origem_id?: string | null
      conta_destino_id?: string | null
      cartao_id?: string | null
      meio_pagamento_tipo?: 'CONTA' | 'CARTAO' | 'DINHEIRO'
    },
    userId?: string,
  ): Promise<any> {
    const anterior = await this.getById(id)
    if (!anterior) throw new Error('Lançamento não encontrado')

    // Se o lançamento pertencer a um cartão, verificar se a fatura está paga (PRD: bloqueio)
    if (anterior.cartao_id && anterior.competencia) {
      const fatura = await faturaService.getFatura(
        workspaceId,
        anterior.cartao_id,
        anterior.competencia,
      )
      if (fatura && fatura.status === 'paga') {
        throw new Error(
          `Este lançamento afeta a fatura paga de ${fatura.competencia}. Desfaça o pagamento da fatura antes de alterar o lançamento.`,
        )
      }
    }

    // Se o lançamento anterior já alterou saldo de contas e está sendo editado, revertemos os saldos do anterior
    if (anterior.status_pagamento === 'pago') {
      const vAnt = Number(anterior.valor)
      if (anterior.tipo === 'despesa' && anterior.conta_origem_id) {
        const c = await contaService.getById(anterior.conta_origem_id)
        if (c) {
          await db
            .from('contas')
            .update({ saldo_atual: Number(c.saldo_atual) + vAnt })
            .eq('id', anterior.conta_origem_id)
        }
      } else if (anterior.tipo === 'receita' && anterior.conta_origem_id) {
        const c = await contaService.getById(anterior.conta_origem_id)
        if (c) {
          await db
            .from('contas')
            .update({ saldo_atual: Number(c.saldo_atual) - vAnt })
            .eq('id', anterior.conta_origem_id)
        }
      } else if (
        anterior.tipo === 'transferencia' &&
        anterior.conta_origem_id &&
        anterior.conta_destino_id
      ) {
        const cO = await contaService.getById(anterior.conta_origem_id)
        const cD = await contaService.getById(anterior.conta_destino_id)
        if (cO) {
          await db
            .from('contas')
            .update({ saldo_atual: Number(cO.saldo_atual) + vAnt })
            .eq('id', anterior.conta_origem_id)
        }
        if (cD) {
          await db
            .from('contas')
            .update({ saldo_atual: Number(cD.saldo_atual) - vAnt })
            .eq('id', anterior.conta_destino_id)
        }
      }
    }

    // Deletar movimentações antigas deste lançamento
    await db.from('movimentacoes_conta').delete().eq('lancamento_id', id)

    // Calcular nova competência caso a data ou cartão tenham mudado
    const dataFinal = updates.data || anterior.data
    const cartaoFinal = updates.cartao_id !== undefined ? updates.cartao_id : anterior.cartao_id
    const meioFinal = updates.meio_pagamento_tipo || anterior.meio_pagamento_tipo

    let novaCompetencia = dataFinal.substring(0, 7)
    if (meioFinal === 'CARTAO' && cartaoFinal) {
      const cartao = await cartaoService.getById(cartaoFinal)
      if (cartao) {
        novaCompetencia = faturaService.calcularCompetenciaCartao(dataFinal, cartao.dia_fechamento)
      }
    }

    const valorFinal = updates.valor !== undefined ? Number(updates.valor) : Number(anterior.valor)
    const statusFinal =
      meioFinal === 'CARTAO' ? 'pendente' : updates.status_pagamento || anterior.status_pagamento

    const { data: updated, error } = await db
      .from('lancamentos')
      .update({
        ...updates,
        valor: valorFinal,
        competencia: novaCompetencia,
        status_pagamento: statusFinal,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select()
      .single()

    if (error) throw error

    // Aplicar novo saldo se pago
    if (statusFinal === 'pago') {
      const cOrigemId =
        updates.conta_origem_id !== undefined ? updates.conta_origem_id : anterior.conta_origem_id
      const cDestinoId =
        updates.conta_destino_id !== undefined
          ? updates.conta_destino_id
          : anterior.conta_destino_id
      const tipo = anterior.tipo

      if (tipo === 'despesa' && cOrigemId) {
        const c = await contaService.getById(cOrigemId)
        if (c) {
          await db
            .from('contas')
            .update({ saldo_atual: Number(c.saldo_atual) - valorFinal })
            .eq('id', cOrigemId)
          await db.from('movimentacoes_conta').insert({
            workspace_id: workspaceId,
            conta_id: cOrigemId,
            lancamento_id: id,
            tipo: 'saida',
            valor: valorFinal,
            data: dataFinal,
            descricao: updates.descricao || anterior.descricao,
            created_by: userId,
          })
        }
      } else if (tipo === 'receita' && cOrigemId) {
        const c = await contaService.getById(cOrigemId)
        if (c) {
          await db
            .from('contas')
            .update({ saldo_atual: Number(c.saldo_atual) + valorFinal })
            .eq('id', cOrigemId)
          await db.from('movimentacoes_conta').insert({
            workspace_id: workspaceId,
            conta_id: cOrigemId,
            lancamento_id: id,
            tipo: 'entrada',
            valor: valorFinal,
            data: dataFinal,
            descricao: updates.descricao || anterior.descricao,
            created_by: userId,
          })
        }
      } else if (tipo === 'transferencia' && cOrigemId && cDestinoId) {
        const cO = await contaService.getById(cOrigemId)
        const cD = await contaService.getById(cDestinoId)
        if (cO && cD) {
          await db
            .from('contas')
            .update({ saldo_atual: Number(cO.saldo_atual) - valorFinal })
            .eq('id', cOrigemId)
          await db
            .from('contas')
            .update({ saldo_atual: Number(cD.saldo_atual) + valorFinal })
            .eq('id', cDestinoId)
          await db.from('movimentacoes_conta').insert([
            {
              workspace_id: workspaceId,
              conta_id: cOrigemId,
              lancamento_id: id,
              tipo: 'transferencia_saida',
              valor: valorFinal,
              data: dataFinal,
              descricao: `Transf. saída para ${cD.nome}`,
              created_by: userId,
            },
            {
              workspace_id: workspaceId,
              conta_id: cDestinoId,
              lancamento_id: id,
              tipo: 'transferencia_entrada',
              valor: valorFinal,
              data: dataFinal,
              descricao: `Transf. entrada de ${cO.nome}`,
              created_by: userId,
            },
          ])
        }
      }
    }

    // Se afetou faturas de cartão, recalcular faturas antiga e nova
    if (anterior.cartao_id && anterior.competencia) {
      await faturaService.recalcularValorFatura(
        workspaceId,
        anterior.cartao_id,
        anterior.competencia,
      )
    }
    if (cartaoFinal && novaCompetencia) {
      await faturaService.getOrCreateFatura(workspaceId, cartaoFinal, novaCompetencia)
      await faturaService.recalcularValorFatura(workspaceId, cartaoFinal, novaCompetencia)
    }

    await auditoriaService.registrar({
      workspace_id: workspaceId,
      entidade: 'lancamentos',
      entidade_id: id,
      acao: 'update',
      estado_anterior: anterior,
      estado_posterior: updated,
      created_by: userId,
    })

    return updated
  },

  async softDelete(id: string, workspaceId: string, userId?: string): Promise<void> {
    const anterior = await this.getById(id)
    if (!anterior) throw new Error('Lançamento não encontrado')

    // Se estiver em fatura paga, bloquear conforme PRD
    if (anterior.cartao_id && anterior.competencia) {
      const fatura = await faturaService.getFatura(
        workspaceId,
        anterior.cartao_id,
        anterior.competencia,
      )
      if (fatura && fatura.status === 'paga') {
        throw new Error(
          `Este lançamento afeta a fatura paga de ${fatura.competencia}. Desfaça o pagamento da fatura antes de cancelar o lançamento.`,
        )
      }
    }

    // Se estava pago, reverter saldo
    if (anterior.status_pagamento === 'pago') {
      const vAnt = Number(anterior.valor)
      if (anterior.tipo === 'despesa' && anterior.conta_origem_id) {
        const c = await contaService.getById(anterior.conta_origem_id)
        if (c) {
          await db
            .from('contas')
            .update({ saldo_atual: Number(c.saldo_atual) + vAnt })
            .eq('id', anterior.conta_origem_id)
        }
      } else if (anterior.tipo === 'receita' && anterior.conta_origem_id) {
        const c = await contaService.getById(anterior.conta_origem_id)
        if (c) {
          await db
            .from('contas')
            .update({ saldo_atual: Number(c.saldo_atual) - vAnt })
            .eq('id', anterior.conta_origem_id)
        }
      } else if (
        anterior.tipo === 'transferencia' &&
        anterior.conta_origem_id &&
        anterior.conta_destino_id
      ) {
        const cO = await contaService.getById(anterior.conta_origem_id)
        const cD = await contaService.getById(anterior.conta_destino_id)
        if (cO) {
          await db
            .from('contas')
            .update({ saldo_atual: Number(cO.saldo_atual) + vAnt })
            .eq('id', anterior.conta_origem_id)
        }
        if (cD) {
          await db
            .from('contas')
            .update({ saldo_atual: Number(cD.saldo_atual) - vAnt })
            .eq('id', anterior.conta_destino_id)
        }
      }
    }

    // Excluir movimentações da conta
    await db.from('movimentacoes_conta').delete().eq('lancamento_id', id)

    // Soft delete
    const { error } = await db
      .from('lancamentos')
      .update({
        deleted_at: new Date().toISOString(),
        status_pagamento: 'cancelado',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('workspace_id', workspaceId)

    if (error) throw error

    // Remover da tabela parcelas se existir
    await db.from('parcelas').delete().eq('lancamento_id', id)

    // Recalcular fatura do cartão se aplicável
    if (anterior.cartao_id && anterior.competencia) {
      await faturaService.recalcularValorFatura(
        workspaceId,
        anterior.cartao_id,
        anterior.competencia,
      )
    }

    await auditoriaService.registrar({
      workspace_id: workspaceId,
      entidade: 'lancamentos',
      entidade_id: id,
      acao: 'cancel_transaction',
      estado_anterior: anterior,
      created_by: userId,
    })
  },

  async toggleConciliado(
    id: string,
    workspaceId: string,
    conciliado: boolean,
    userId?: string,
  ): Promise<void> {
    const anterior = await this.getById(id)
    const { error } = await db
      .from('lancamentos')
      .update({
        conciliado: conciliado,
        data_conciliacao: conciliado ? new Date().toISOString() : null,
        conciliado_por: conciliado ? userId : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('workspace_id', workspaceId)

    if (error) throw error

    await auditoriaService.registrar({
      workspace_id: workspaceId,
      entidade: 'lancamentos',
      entidade_id: id,
      acao: conciliado ? 'conciliar' : 'desconciliar',
      estado_anterior: anterior,
      created_by: userId,
    })
  },

  async togglePago(id: string, workspaceId: string, pago: boolean, userId?: string): Promise<void> {
    const anterior = await this.getById(id)
    if (!anterior) throw new Error('Lançamento não encontrado')

    if (anterior.meio_pagamento_tipo === 'CARTAO') {
      throw new Error(
        'Lançamentos em cartão de crédito são quitados através do pagamento da fatura.',
      )
    }

    const valorNum = Number(anterior.valor)
    const novoStatus = pago ? 'pago' : 'pendente'
    const dataPag = pago ? new Date().toISOString().split('T')[0] : null

    if (pago && anterior.status_pagamento !== 'pago') {
      // Baixar saldo
      if (anterior.tipo === 'despesa' && anterior.conta_origem_id) {
        const c = await contaService.getById(anterior.conta_origem_id)
        if (c) {
          await db
            .from('contas')
            .update({ saldo_atual: Number(c.saldo_atual) - valorNum })
            .eq('id', anterior.conta_origem_id)
          await db.from('movimentacoes_conta').insert({
            workspace_id: workspaceId,
            conta_id: anterior.conta_origem_id,
            lancamento_id: id,
            tipo: 'saida',
            valor: valorNum,
            data: dataPag || anterior.data,
            descricao: anterior.descricao,
            created_by: userId,
          })
        }
      } else if (anterior.tipo === 'receita' && anterior.conta_origem_id) {
        const c = await contaService.getById(anterior.conta_origem_id)
        if (c) {
          await db
            .from('contas')
            .update({ saldo_atual: Number(c.saldo_atual) + valorNum })
            .eq('id', anterior.conta_origem_id)
          await db.from('movimentacoes_conta').insert({
            workspace_id: workspaceId,
            conta_id: anterior.conta_origem_id,
            lancamento_id: id,
            tipo: 'entrada',
            valor: valorNum,
            data: dataPag || anterior.data,
            descricao: anterior.descricao,
            created_by: userId,
          })
        }
      }
    } else if (!pago && anterior.status_pagamento === 'pago') {
      // Desfazer pagamento / estornar
      if (anterior.tipo === 'despesa' && anterior.conta_origem_id) {
        const c = await contaService.getById(anterior.conta_origem_id)
        if (c) {
          await db
            .from('contas')
            .update({ saldo_atual: Number(c.saldo_atual) + valorNum })
            .eq('id', anterior.conta_origem_id)
        }
      } else if (anterior.tipo === 'receita' && anterior.conta_origem_id) {
        const c = await contaService.getById(anterior.conta_origem_id)
        if (c) {
          await db
            .from('contas')
            .update({ saldo_atual: Number(c.saldo_atual) - valorNum })
            .eq('id', anterior.conta_origem_id)
        }
      }
      await db.from('movimentacoes_conta').delete().eq('lancamento_id', id)
    }

    const { error } = await db
      .from('lancamentos')
      .update({
        status_pagamento: novoStatus,
        data_pagamento: dataPag,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('workspace_id', workspaceId)

    if (error) throw error

    await auditoriaService.registrar({
      workspace_id: workspaceId,
      entidade: 'lancamentos',
      entidade_id: id,
      acao: pago ? 'pay_transaction' : 'unpay_transaction',
      estado_anterior: anterior,
      created_by: userId,
    })
  },
}

// ----------------------------------------------------
// BUILD 2: SERVIÇO DE CONCILIAÇÃO BANCÁRIA
// ----------------------------------------------------
export const conciliacaoService = {
  async getHistorico(workspaceId: string, contaId: string): Promise<any[]> {
    const { data, error } = await db
      .from('conciliacoes_conta')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('conta_id', contaId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  async registrarConciliacaoComAjuste(dados: {
    workspace_id: string
    conta_id: string
    saldo_extrato: number
    data_extrato: string
    observacao?: string
    ajustarSaldo: boolean
    userId?: string
  }): Promise<any> {
    const conta = await contaService.getById(dados.conta_id)
    if (!conta) throw new Error('Conta não encontrada')

    const saldoSistema = Number(conta.saldo_atual)
    const saldoExtrato = Number(dados.saldo_extrato)
    const divergencia = saldoExtrato - saldoSistema

    let lancAjusteId: string | null = null

    // Se o usuário pediu ajuste e há divergência, cria lançamento auditado de ajuste
    if (dados.ajustarSaldo && Math.abs(divergencia) > 0.001) {
      const tipo = divergencia > 0 ? 'receita' : 'despesa'
      const valorAjuste = Math.abs(divergencia)

      const lancAjuste = await lancamentoService.create({
        workspace_id: dados.workspace_id,
        tipo: tipo,
        regime: 'unico',
        data: dados.data_extrato,
        descricao: `Ajuste de Conciliação Bancária (${conta.nome})`,
        valor: valorAjuste,
        meio_pagamento_tipo: 'CONTA',
        conta_origem_id: dados.conta_id,
        status_pagamento: 'pago',
        observacao: `Ajuste automático para igualar ao extrato bancário de ${dados.data_extrato}. Divergência apurada: R$ ${divergencia.toFixed(2)}`,
        created_by: dados.userId,
      })

      lancAjusteId = lancAjuste.id
    }

    const { data: conc, error } = await db
      .from('conciliacoes_conta')
      .insert({
        workspace_id: dados.workspace_id,
        conta_id: dados.conta_id,
        data_extrato: dados.data_extrato,
        saldo_sistema: saldoSistema,
        saldo_extrato: saldoExtrato,
        divergencia: divergencia,
        ajustado: dados.ajustarSaldo && Math.abs(divergencia) > 0.001,
        lancamento_ajuste_id: lancAjusteId,
        observacao: dados.observacao || null,
        created_by: dados.userId,
      })
      .select()
      .single()

    if (error) throw error

    await auditoriaService.registrar({
      workspace_id: dados.workspace_id,
      entidade: 'conciliacoes_conta',
      entidade_id: conc.id,
      acao: 'create_reconciliation',
      estado_posterior: conc,
      created_by: dados.userId,
    })

    return conc
  },
}
