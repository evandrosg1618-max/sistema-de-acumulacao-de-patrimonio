import { supabase } from '@/lib/supabase/client'
import { WorkspaceMember, AuditoriaOperacao, UserProfileData, SerieLancamento } from '@/types/sap'

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
// ==========================================
// BUILD 5: FIXO SERVICE (Recorrentes, Materialização Preguiçosa e Projeções)
// ==========================================
export const fixoService = {
  async criarSerieFixa(
    workspaceId: string,
    dados: {
      tipo: 'despesa' | 'receita' | 'transferencia'
      descricao: string
      valor: number
      data_inicio: string
      prazo: 'indeterminado' | 'determinado'
      periodicidade: 'mensal' | 'semestral' | 'anual'
      quantidade_total?: number | null
      meio_pagamento_tipo: 'CONTA' | 'CARTAO' | 'DINHEIRO'
      conta_origem_id?: string | null
      conta_destino_id?: string | null
      cartao_id?: string | null
      categoria_id?: string | null
      subcategoria_id?: string | null
      observacao?: string | null
      pago_primeira?: boolean
    },
    userId?: string,
  ): Promise<{
    sucesso: boolean
    serie_id: string
    ocorrencias_geradas: number
    data_limite_projecao: string
    proxima_competencia: string
  }> {
    const { data, error } = await db.rpc('criar_serie_fixa_rpc', {
      p_workspace_id: workspaceId,
      p_tipo: dados.tipo,
      p_descricao: dados.descricao.trim(),
      p_valor: Number(dados.valor),
      p_data_inicio: dados.data_inicio,
      p_prazo: dados.prazo,
      p_periodicidade: dados.periodicidade,
      p_quantidade_total: dados.quantidade_total ? Number(dados.quantidade_total) : null,
      p_meio_pagamento_tipo: dados.meio_pagamento_tipo,
      p_conta_origem_id: dados.conta_origem_id || null,
      p_conta_destino_id: dados.conta_destino_id || null,
      p_cartao_id: dados.cartao_id || null,
      p_categoria_id: dados.categoria_id || null,
      p_subcategoria_id: dados.subcategoria_id || null,
      p_observacao: dados.observacao || null,
      p_pago_primeira: Boolean(dados.pago_primeira),
      p_user_id: userId || null,
    })

    if (error) {
      throw new Error(
        error.message ||
          'Não foi possível criar o lançamento fixo — tente novamente; se persistir, atualize a página.',
      )
    }

    return data as any
  },

  async materializarPendentes(
    workspaceId: string,
    userId?: string,
  ): Promise<{
    sucesso: boolean
    materializados: number
    faturas_recalculadas: string[]
  }> {
    const { data, error } = await db.rpc('materializar_fixos_pendentes_rpc', {
      p_workspace_id: workspaceId,
      p_user_id: userId || null,
    })

    if (error) {
      console.warn('Erro ao materializar fixos pendentes:', error.message)
      return { sucesso: false, materializados: 0, faturas_recalculadas: [] }
    }

    return (data as any) || { sucesso: true, materializados: 0, faturas_recalculadas: [] }
  },

  async renovarProjecao(
    workspaceId: string,
    serieId: string,
    dados?: {
      novo_valor?: number
      nova_categoria_id?: string | null
    },
    userId?: string,
  ): Promise<{
    sucesso: boolean
    novo_limite: string
    novas_geradas: number
  }> {
    const { data, error } = await db.rpc('renovar_projecao_fixo_rpc', {
      p_workspace_id: workspaceId,
      p_serie_id: serieId,
      p_novo_valor: dados?.novo_valor ? Number(dados.novo_valor) : null,
      p_nova_data_base: null,
      p_nova_categoria_id: dados?.nova_categoria_id || null,
      p_user_id: userId || null,
    })

    if (error) {
      throw new Error(
        error.message ||
          'Não foi possível renovar a projeção da série fixa — tente novamente; se persistir, atualize a página.',
      )
    }

    return data as any
  },

  async getSerieById(serieId: string, workspaceId: string): Promise<SerieLancamento | null> {
    const { data, error } = await db
      .from('series_lancamentos')
      .select('*')
      .eq('id', serieId)
      .eq('workspace_id', workspaceId)
      .single()

    if (error) return null
    return data as SerieLancamento
  },

  async verificarSeUltimaOcorrenciaJanela(
    lancamentoId: string,
    workspaceId: string,
  ): Promise<{
    ehUltima: boolean
    serie: SerieLancamento | null
  }> {
    const lanc = await lancamentoService.getById(lancamentoId)
    if (!lanc || !lanc.serie_id || lanc.regime !== 'fixo') {
      return { ehUltima: false, serie: null }
    }

    const serie = await this.getSerieById(lanc.serie_id, workspaceId)
    if (!serie || serie.prazo !== 'indeterminado') {
      return { ehUltima: false, serie }
    }

    // Busca se existe algum outro lançamento posterior nesta mesma série que não esteja deletado
    const { data: posteriores } = await db
      .from('lancamentos')
      .select('id')
      .eq('serie_id', lanc.serie_id)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .gt('data', lanc.data)
      .limit(1)

    const ehUltima = !posteriores || posteriores.length === 0
    return { ehUltima, serie }
  },

  // Alias para lancamentoService.excluirFixoComEscopo para compatibilidade entre páginas
  async excluirFixoComEscopo(
    lancamentoId: string,
    workspaceId: string,
    escopo: 'este' | 'este_e_proximos' | 'todos',
    userId?: string,
  ) {
    return lancamentoService.excluirFixoComEscopo(lancamentoId, workspaceId, escopo, userId)
  },

  async obterStatusSerieFixa(
    lancamentoId: string,
    workspaceId: string,
  ): Promise<{
    encontrado: boolean
    serie_id?: string
    tem_pagas?: boolean
    competencias_pagas?: string[]
    total_nao_pagos?: number
    descricao?: string
    data_inicio?: string
    valor?: number
  }> {
    try {
      const { data, error } = await db.rpc('obter_status_serie_fixa_rpc', {
        p_workspace_id: workspaceId,
        p_lancamento_id: lancamentoId,
      })
      if (error) {
        console.warn('Erro ao obter status da série fixa:', error)
        return { encontrado: false, tem_pagas: false, competencias_pagas: [] }
      }
      return (data as any) || { encontrado: false, tem_pagas: false, competencias_pagas: [] }
    } catch (e) {
      console.warn('Exceção ao obter status da série fixa:', e)
      return { encontrado: false, tem_pagas: false, competencias_pagas: [] }
    }
  },

  // Alias para lancamentoService.alterarFixoComEscopo para compatibilidade entre páginas
  async alterarComEscopo(
    lancamentoId: string,
    workspaceId: string,
    escopo: 'todos' | 'este_e_proximos' | 'este',
    novosDados: {
      valor: number
      data: string
      descricao: string
      categoria_id?: string | null
      subcategoria_id?: string | null
      observacao?: string | null
      prazo?: 'indeterminado' | 'determinado' | null
      quantidade_total?: number | null
      periodicidade?: 'mensal' | 'semestral' | 'anual' | null
      meio_pagamento_tipo?: 'CONTA' | 'CARTAO' | 'DINHEIRO' | null
      conta_origem_id?: string | null
      conta_destino_id?: string | null
      cartao_id?: string | null
      pago_primeira?: boolean
    },
    userId?: string,
  ) {
    return lancamentoService.alterarFixoComEscopo(
      lancamentoId,
      workspaceId,
      escopo,
      novosDados,
      userId,
    )
  },
}

export const cartaoService = {
  async list(workspaceId: string, incluirInativos = false): Promise<any[]> {
    // Desempenho (Frente 4): Chamada única à RPC consolidada do PostgreSQL
    try {
      const { data: rpcData, error: rpcError } = await db.rpc('obter_cartoes_consolidado_rpc', {
        p_workspace_id: workspaceId,
        p_incluir_inativos: incluirInativos,
      })

      if (!rpcError && rpcData) {
        return rpcData.map((c: any) => ({
          ...c,
          limite: Number(c.limite || 0),
          fatura_atual: Number(c.fatura_atual || 0),
          total_comprometido: Number(c.total_comprometido || 0),
        }))
      }
    } catch (err) {
      console.warn('Fallback na listagem consolidada de cartões:', err)
    }

    // Fallback seguro caso a RPC falhe
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

    return (data || []).map((c: any) => ({
      ...c,
      limite: Number(c.limite || 0),
      fatura_atual: 0,
      total_comprometido: 0,
    }))
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

    // Se houve alteração no dia_fechamento ou dia_vencimento, invocar a RPC atualizar_fechamento_cartao_rpc
    // Ela realinha as competências de faturas abertas, bloqueando faturas pagas e recalculando tudo
    const mudouFechamento =
      updates.dia_fechamento !== undefined &&
      Number(updates.dia_fechamento) !== Number(anterior?.dia_fechamento)
    const mudouVencimento =
      updates.dia_vencimento !== undefined &&
      Number(updates.dia_vencimento) !== Number(anterior?.dia_vencimento)

    if (mudouFechamento || mudouVencimento) {
      const novoFech = updates.dia_fechamento ?? anterior?.dia_fechamento
      const novoVenc = updates.dia_vencimento ?? anterior?.dia_vencimento

      try {
        await db.rpc('atualizar_fechamento_cartao_rpc', {
          p_workspace_id: workspaceId,
          p_cartao_id: id,
          p_novo_dia_fechamento: Number(novoFech),
          p_novo_dia_vencimento: Number(novoVenc),
          p_user_id: userId || null,
        })
      } catch (rpcErr) {
        console.warn('Erro ao chamar atualizar_fechamento_cartao_rpc:', rpcErr)
      }
    }

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
  // Obter competência da fatura (MÊS DO VENCIMENTO) com base na data da compra, dia de fechamento e dia de vencimento
  calcularCompetenciaCartao(dataCompra: string, diaFechamento: number, diaVencimento = 20): string {
    const dt = new Date(dataCompra + 'T12:00:00')
    const dia = dt.getDate()
    let ano = dt.getFullYear()
    let mes = dt.getMonth() + 1 // 1 a 12

    const fech = diaFechamento || 10
    const venc = diaVencimento || 20

    // Se vencimento é <= fechamento (ex: fecha 17, vence 01), o vencimento deste fechamento é no mês seguinte
    if (venc <= fech) {
      mes += 1
      if (mes > 12) {
        mes = 1
        ano += 1
      }
    }

    // Se a compra foi após o dia de fechamento, cai no ciclo seguinte (+1 mês)
    if (dia > fech) {
      mes += 1
      if (mes > 12) {
        mes = 1
        ano += 1
      }
    }

    return `${ano}-${String(mes).padStart(2, '0')}`
  },

  // Retorna a data (YYYY-MM-DD) do dia de fechamento correspondente à fatura de uma dada competência
  // Regra: se compra até o fechamento cai na competência do vencimento:
  // Se vencimento > fechamento (ex: fecha 10, vence 20): o fechamento é no MESMO ano-mês do vencimento (competência).
  // Se vencimento <= fechamento (ex: fecha 25, vence 05): o fechamento ocorre no mês ANTERIOR ao do vencimento.
  calcularDataFechamentoDaCompetencia(
    competencia: string,
    diaFechamento: number,
    diaVencimento = 20,
  ): string {
    const [anoStr, mesStr] = competencia.split('-')
    let ano = parseInt(anoStr, 10)
    let mes = parseInt(mesStr, 10) // Mês da competência (mês do vencimento da fatura)

    const fech = diaFechamento || 10
    const venc = diaVencimento || 20

    if (venc <= fech) {
      // O fechamento foi no mês anterior
      mes -= 1
      if (mes < 1) {
        mes = 12
        ano -= 1
      }
    }

    const ultDiaMes = new Date(ano, mes, 0).getDate()
    const dia = Math.min(fech, ultDiaMes)
    return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
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
    try {
      const { data, error } = await db.rpc('recalcular_fatura_rpc', {
        p_workspace_id: workspaceId,
        p_cartao_id: cartaoId,
        p_competencia: competencia,
      })
      if (!error && data !== null && data !== undefined) {
        return Number(data)
      }
    } catch (err) {
      console.warn('Erro ao chamar recalcular_fatura_rpc, usando fallback:', err)
    }

    // Fallback legado se a RPC falhar
    await this.getOrCreateFatura(workspaceId, cartaoId, competencia)

    const { data: parcList } = await db
      .from('parcelas')
      .select('valor, lancamentos!inner(deleted_at)')
      .eq('workspace_id', workspaceId)
      .eq('cartao_id', cartaoId)
      .eq('competencia', competencia)
      .is('lancamentos.deleted_at', null)

    let totalParcelas = 0
    if (parcList && parcList.length > 0) {
      for (const p of parcList) {
        totalParcelas += Number(p.valor || 0)
      }
    }

    const { data: lancsAvulso } = await db
      .from('lancamentos')
      .select('valor, tipo')
      .eq('workspace_id', workspaceId)
      .eq('cartao_id', cartaoId)
      .eq('competencia', competencia)
      .eq('regime', 'unico')
      .is('deleted_at', null)

    let totalAvulso = 0
    for (const l of lancsAvulso || []) {
      if (l.tipo === 'despesa') totalAvulso += Number(l.valor || 0)
      else if (l.tipo === 'receita') totalAvulso -= Number(l.valor || 0)
    }

    const total = Math.max(0, Math.round((totalParcelas + totalAvulso) * 100) / 100)

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
    forcarRecalculoTotal = false,
  ): Promise<{
    fatura: any
    totalCompras: number
    totalPago: number
    saldoDevedor: number
    status: 'aberta' | 'fechada' | 'paga'
    statusExibicao: 'Aberta' | 'Fechada' | 'Paga'
    isAtrasada: boolean
    itens: any[]
  }> {
    // Garante que o valor da fatura esteja sempre sincronizado no banco
    try {
      await db.rpc('recalcular_fatura_rpc', {
        p_workspace_id: workspaceId,
        p_cartao_id: cartaoId,
        p_competencia: competencia,
      })
    } catch (e) {
      console.warn('recalcular_fatura_rpc em getResumoFaturaCompetencia:', e)
    }
    const fatura = await this.getOrCreateFatura(workspaceId, cartaoId, competencia)
    if (forcarRecalculoTotal) {
      await this.recalcularValorFatura(workspaceId, cartaoId, competencia)
    }

    // 1. Buscar parcelas da tabela 'parcelas' pertencentes a este cartão e competência
    // vinculando aos dados do lançamento original (pai)
    const { data: parcelasComp } = await db
      .from('parcelas')
      .select(`
        id,
        lancamento_id,
        numero_parcela,
        total_parcelas,
        valor,
        competencia,
        data_vencimento,
        cartao_id,
        status,
        lancamentos!inner(
          id,
          descricao,
          data,
          categoria_id,
          subcategoria_id,
          observacao,
          deleted_at,
          categorias (id, nome, cor, icone),
          subcategorias (id, nome)
        )
      `)
      .eq('workspace_id', workspaceId)
      .eq('cartao_id', cartaoId)
      .eq('competencia', competencia)
      .is('lancamentos.deleted_at', null)
      .order('data_vencimento', { ascending: false })

    const itensFatura: any[] = []
    let totalCompras = 0

    for (const p of parcelasComp || []) {
      const v = Number(p.valor || 0)
      totalCompras += v
      const orig = p.lancamentos as any
      itensFatura.push({
        id: p.id,
        parcela_id: p.id,
        lancamento_id: p.lancamento_id,
        lancamento_pai_id: p.lancamento_id, // aponta para o lançamento original
        descricao: orig?.descricao || 'Despesa no Cartão',
        valor: v,
        data: p.data_vencimento || orig?.data,
        competencia: p.competencia,
        tipo: 'despesa',
        meio_pagamento_tipo: 'CARTAO',
        cartao_id: p.cartao_id,
        numero_parcela: p.numero_parcela,
        total_parcelas: p.total_parcelas,
        quantidade_parcelas: p.total_parcelas,
        status_pagamento: p.status || 'pendente',
        observacao: orig?.observacao,
        categoria_id: orig?.categoria_id,
        subcategoria_id: orig?.subcategoria_id,
        categorias: orig?.categorias,
        subcategorias: orig?.subcategorias,
      })
    }

    // 2. Buscar compras no cartão avulsas (estritamente regime = 'unico' e SEM filhos em parcelas)
    // E lançamentos recorrentes/fixos deste cartão
    // NENHUM registro de lancamentos com regime 'parcelado' ou que seja pai de parcelas pode entrar na listagem ou na soma da fatura.
    const { data: lancsCartaoComp } = await db
      .from('lancamentos')
      .select(`
        id,
        descricao,
        valor,
        data,
        competencia,
        tipo,
        regime,
        serie_id,
        natureza_previsao,
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
        subcategorias (id, nome),
        parcelas:parcelas(id)
      `)
      .eq('workspace_id', workspaceId)
      .eq('cartao_id', cartaoId)
      .eq('competencia', competencia)
      .neq('regime', 'parcelado')
      .is('deleted_at', null)
      .order('data', { ascending: false })

    // Determinar a próxima competência a vencer deste cartão para compor o total da fatura
    const { data: faturasVencer } = await db
      .from('faturas')
      .select('competencia, data_vencimento')
      .eq('workspace_id', workspaceId)
      .eq('cartao_id', cartaoId)
      .neq('status', 'paga')
      .gte('data_vencimento', new Date().toISOString().slice(0, 10))
      .order('data_vencimento', { ascending: true })
      .limit(1)

    let proximaComp = faturasVencer?.[0]?.competencia
    if (!proximaComp) {
      const { data: faturasTodas } = await db
        .from('faturas')
        .select('competencia, data_vencimento')
        .eq('workspace_id', workspaceId)
        .eq('cartao_id', cartaoId)
        .neq('status', 'paga')
        .order('data_vencimento', { ascending: true })
        .limit(1)
      proximaComp = faturasTodas?.[0]?.competencia
    }

    const ehProximaCompAVencer = competencia === proximaComp

    for (const a of lancsCartaoComp || []) {
      // Se tiver parcelas filhas ou for regime parcelado, descarta estritamente (pois as cotas já estão em parcelasComp)
      const temParcelas = Array.isArray(a.parcelas) && a.parcelas.length > 0
      if (temParcelas || a.regime === 'parcelado') {
        continue
      }

      const v = Number(a.valor || 0)
      const ehRecorrenteFixo = a.regime === 'fixo' || !!a.serie_id

      if (ehRecorrenteFixo) {
        // Regra do Usuário (Build 5): O recorrente aparece na fatura, mas na soma que compõe a fatura
        // considerar APENAS o lançamento recorrente que cai na próxima competência a vencer.
        if (ehProximaCompAVencer) {
          if (a.tipo === 'despesa') totalCompras += v
          else if (a.tipo === 'receita') totalCompras -= v
        }
      } else {
        // Compra à vista normal (estritamente sem parcelas filhas)
        if (a.tipo === 'despesa') totalCompras += v
        else if (a.tipo === 'receita') totalCompras -= v
      }

      // Remover a chave temporária de verificação antes de colocar em itensFatura
      const { parcelas: _p, ...itemLimpo } = a
      itensFatura.push(itemLimpo)
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
    const statusDinamico =
      (totalPago >= totalCompras && totalCompras > 0) || fatura.status === 'paga'
        ? 'paga'
        : fatura.status

    // Regra Build 5: Exibição deriva de data atual × fechamento/vencimento/pagamento
    // • "Aberta" = fatura cuja data atual AINDA NÃO chegou na data de fechamento;
    // • Após a data de fechamento, exibir "Fechada" — e o botão Pagar continua, pois fechada ≠ paga;
    // • Se fechada, não paga e data de vencimento já passou: tarja vermelha "Fatura atrasada"
    // Respeita fuso horário do PRD (UTC-4) para fechamento e vencimento
    const hojeStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Porto_Velho',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
    let statusExibicao: 'Aberta' | 'Fechada' | 'Paga' = 'Aberta'
    let isAtrasada = false

    if (statusDinamico === 'paga') {
      statusExibicao = 'Paga'
    } else {
      const dataFech = fatura.data_fechamento || `${competencia}-01`
      const dataVenc = fatura.data_vencimento || `${competencia}-28`

      if (hojeStr >= dataFech) {
        statusExibicao = 'Fechada'
        if (hojeStr > dataVenc) {
          isAtrasada = true
        }
      } else {
        statusExibicao = 'Aberta'
      }
    }

    return {
      fatura,
      totalCompras,
      totalPago,
      saldoDevedor,
      status: statusDinamico,
      statusExibicao,
      isAtrasada,
      itens: itensFatura,
    }
  },

  async listFaturasCartao(workspaceId: string, cartaoId: string): Promise<any[]> {
    const { data, error } = await db
      .from('faturas')
      .select(`
        *,
        pagamentos_fatura (valor, status)
      `)
      .eq('workspace_id', workspaceId)
      .eq('cartao_id', cartaoId)
      .order('competencia', { ascending: false })

    if (error) throw error
    return (data || []).map((f: any) => {
      const pags = (f.pagamentos_fatura || []).filter((p: any) => p.status === 'efetivado')
      const totalPagoEfetivado = pags.reduce((acc: number, p: any) => acc + Number(p.valor || 0), 0)
      const valorExibicao =
        f.status === 'paga' && totalPagoEfetivado > 0
          ? totalPagoEfetivado
          : Number(f.valor_total || 0)

      return {
        ...f,
        valor_total: valorExibicao,
        valor_pago_real: totalPagoEfetivado,
      }
    })
  },

  async getFaturasDoMes(workspaceId: string, competencia: string): Promise<any[]> {
    const { data, error } = await db
      .from('faturas')
      .select(`
        id,
        cartao_id,
        competencia,
        data_fechamento,
        data_vencimento,
        valor_total,
        status,
        cartoes (id, nome, cor, dia_vencimento, dia_fechamento)
      `)
      .eq('workspace_id', workspaceId)
      .eq('competencia', competencia)

    if (error) {
      console.warn('Erro ao listar faturas do mês:', error)
      return []
    }

    return (data || []).map((f: any) => ({
      ...f,
      valor_total: Number(f.valor_total || 0),
      cartao: f.cartoes,
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
    const valorNum = Number(dados.valor)
    if (valorNum <= 0) throw new Error('Valor do pagamento deve ser maior que zero')

    // Verificação prévia no banco: se já está paga, não reexecutar
    const { data: faturaAtual } = await db
      .from('faturas')
      .select('id, status, competencia')
      .eq('id', dados.fatura_id)
      .single()

    if (faturaAtual?.status === 'paga') {
      return { sucesso: true, ja_paga: true, mensagem: 'Esta fatura já se encontra paga.' }
    }

    // Chamada à RPC atômica e idempotente no PostgreSQL
    const { data, error } = await db.rpc('pagar_fatura_rpc', {
      p_workspace_id: dados.workspace_id,
      p_fatura_id: dados.fatura_id,
      p_conta_id: dados.conta_id,
      p_valor: valorNum,
      p_data_pagamento: dados.data_pagamento,
      p_user_id: dados.userId || null,
    })

    if (error) {
      throw new Error(
        error.message ||
          'Não foi possível concluir o pagamento da fatura — verifique sua conexão e tente novamente; se persistir, atualize a página.',
      )
    }

    return data
  },

  async estornarPagamentoFatura(
    faturaId: string,
    workspaceId: string,
    userId?: string,
  ): Promise<any> {
    // Verificação prévia no banco: se já não estiver paga, nada a desfazer
    const { data: faturaAtual } = await db
      .from('faturas')
      .select('id, status')
      .eq('id', faturaId)
      .single()

    if (faturaAtual && faturaAtual.status !== 'paga') {
      return { sucesso: true, ja_reaberta: true }
    }

    // Chamada à RPC atômica e idempotente no PostgreSQL
    const { data, error } = await db.rpc('estornar_fatura_rpc', {
      p_workspace_id: workspaceId,
      p_fatura_id: faturaId,
      p_user_id: userId || null,
    })

    if (error) {
      throw new Error(
        error.message ||
          'Não foi possível reabrir a fatura — verifique e tente novamente; se persistir, recarregue a página.',
      )
    }

    return data
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
        cartoes (id, nome, bandeira, limite, cor, dia_fechamento, dia_vencimento),
        series_lancamentos (id, prazo, quantidade_total, descricao)
      `)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('data', { ascending: true })
      .order('created_at', { ascending: true })

    // Se for a tela geral de Lançamentos (sem filtro de cartão específico de fatura),
    // oculta os filhos de compras parceladas no cartão (numero_parcela > 1 e serie_id is null)
    // para que a compra parcelada apareça apenas como o lançamento ORIGINAL com o total e a especificação das parcelas.
    // Lançamentos de séries recorrentes (serie_id is not null) NUNCA são ocultados, pois cada mês é uma ocorrência válida da série.
    if (!filtros.cartaoId || filtros.cartaoId === 'todos') {
      query = query.or('serie_id.not.is.null,numero_parcela.is.null,numero_parcela.lte.1')
    }
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
      series_lancamentos: l.series_lancamentos,
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
          cartaoObj.dia_vencimento,
        )

        // REQUISITO 2: Bloquear inclusão de novos lançamentos dentro de uma fatura paga
        const faturaExistente = await faturaService.getFatura(
          dados.workspace_id,
          dados.cartao_id,
          competenciaInicial,
        )
        if (faturaExistente && faturaExistente.status === 'paga') {
          throw new Error(
            `A fatura de ${competenciaInicial} já está com pagamento realizado. Não é permitido incluir novos lançamentos nesta fatura. Para liberar a inclusão, desfaça o pagamento da fatura de ${competenciaInicial} na tela de Cartões clicando em "Estornar Pagamento".`,
          )
        }
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
    // PARCELAMENTO NO CARTÃO OU CONTA BANCÁRIA:
    // Suporte tanto para cartão de crédito quanto para conta bancária
    // (sem exigir especificação de boleto/Pix conforme PRD)
    // ==========================================
    if (dados.meio_pagamento_tipo !== 'CARTAO') {
      // Parcelamento em conta bancária/dinheiro: gera parcelas mensais na conta
      const valorParcelaBase = Math.floor((valorNum / qtdParcelas) * 100) / 100
      const diferencaCentavos = Math.round((valorNum - valorParcelaBase * qtdParcelas) * 100) / 100

      const somarMesesData = (dataStr: string, meses: number): string => {
        const d = new Date(dataStr + 'T12:00:00Z')
        const dia = d.getUTCDate()
        const mes = d.getUTCMonth() + meses
        const ano = d.getUTCFullYear()
        const novoD = new Date(Date.UTC(ano, mes, 1))
        const maxDias = new Date(
          Date.UTC(novoD.getUTCFullYear(), novoD.getUTCMonth() + 1, 0),
        ).getUTCDate()
        novoD.setUTCDate(Math.min(dia, maxDias))
        return novoD.toISOString().split('T')[0]
      }

      // 1ª parcela
      const valorParcela1 = Number(
        (valorParcelaBase + (qtdParcelas === 1 ? diferencaCentavos : 0)).toFixed(2),
      )
      const statusParc1 = dados.status_pagamento === 'pago' ? 'pago' : 'pendente'

      const { data: lancPai, error: paiErr } = await db
        .from('lancamentos')
        .insert({
          workspace_id: dados.workspace_id,
          tipo: dados.tipo,
          regime: 'parcelado',
          data: dados.data,
          competencia: dados.data.substring(0, 7),
          descricao: `${dados.descricao.trim()} (1/${qtdParcelas})`,
          valor: valorParcela1,
          meio_pagamento_tipo: dados.meio_pagamento_tipo,
          conta_origem_id: dados.conta_origem_id || null,
          conta_destino_id: dados.conta_destino_id || null,
          categoria_id: dados.categoria_id || null,
          subcategoria_id: dados.subcategoria_id || null,
          status_pagamento: statusParc1,
          data_pagamento: statusParc1 === 'pago' ? dados.data : null,
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
      await db.from('lancamentos').update({ lancamento_pai_id: lancPai.id }).eq('id', lancPai.id)

      if (statusParc1 === 'pago' && dados.conta_origem_id) {
        const c = await contaService.getById(dados.conta_origem_id)
        if (c) {
          const delta = dados.tipo === 'despesa' ? -valorParcela1 : valorParcela1
          await db
            .from('contas')
            .update({
              saldo_atual: Number(c.saldo_atual) + delta,
              updated_at: new Date().toISOString(),
            })
            .eq('id', dados.conta_origem_id)

          await db.from('movimentacoes_conta').insert({
            workspace_id: dados.workspace_id,
            conta_id: dados.conta_origem_id,
            lancamento_id: lancPai.id,
            tipo: dados.tipo === 'despesa' ? 'saida' : 'entrada',
            valor: valorParcela1,
            data: dados.data,
            descricao: `${dados.descricao} (1/${qtdParcelas})`,
            created_by: dados.created_by,
          })
        }
      }

      // Parcelas 2 a N (sempre pendentes até ação do usuário)
      for (let p = 2; p <= qtdParcelas; p++) {
        const dataParc = somarMesesData(dados.data, p - 1)
        const compParc = dataParc.substring(0, 7)
        const valorDestaParcela =
          p === qtdParcelas
            ? Number((valorParcelaBase + diferencaCentavos).toFixed(2))
            : valorParcelaBase

        await db.from('lancamentos').insert({
          workspace_id: dados.workspace_id,
          tipo: dados.tipo,
          regime: 'parcelado',
          data: dataParc,
          competencia: compParc,
          descricao: `${dados.descricao.trim()} (${p}/${qtdParcelas})`,
          valor: valorDestaParcela,
          meio_pagamento_tipo: dados.meio_pagamento_tipo,
          conta_origem_id: dados.conta_origem_id || null,
          conta_destino_id: dados.conta_destino_id || null,
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
      }

      await auditoriaService.registrar({
        workspace_id: dados.workspace_id,
        entidade: 'lancamentos',
        entidade_id: lancPai.id,
        acao: 'create_bank_installment_series',
        estado_posterior: {
          pai_id: lancPai.id,
          total_parcelas: qtdParcelas,
          valor_total: valorNum,
        },
        created_by: dados.created_by,
      })

      return lancPai
    }

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

    // 1. Cria o lançamento original da despesa guardando o VALOR TOTAL (ex: R$400,00)
    // Conforme PRD / Frente 4: o lançamento original guarda o total e a quantidade de parcelas.
    const { data: lancPai, error: paiErr } = await db
      .from('lancamentos')
      .insert({
        workspace_id: dados.workspace_id,
        tipo: 'despesa',
        regime: 'parcelado',
        data: dados.data,
        competencia: competenciaInicial,
        descricao: dados.descricao.trim(),
        valor: valorNum, // Valor total do lançamento original
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

    // Vincula o original a si mesmo como raiz
    await db.from('lancamentos').update({ lancamento_pai_id: lancPai.id }).eq('id', lancPai.id)

    const valorParcela1 = Number(
      (valorParcelaBase + (qtdParcelas === 1 ? diferencaCentavos : 0)).toFixed(2),
    )

    // Cria a 1ª parcela na tabela parcelas referenciando o lançamento original (pai)
    await db.from('parcelas').insert({
      workspace_id: dados.workspace_id,
      lancamento_id: lancPai.id,
      numero_parcela: 1,
      total_parcelas: qtdParcelas,
      valor: valorParcela1,
      competencia: competenciaInicial,
      data_vencimento: dados.data,
      cartao_id: dados.cartao_id,
      status: 'pendente',
    })

    const competenciasAfetadas = new Set<string>([competenciaInicial])

    // Cria as parcelas 2 a N como lançamentos filhos e na tabela parcelas
    for (let p = 2; p <= qtdParcelas; p++) {
      const compParcela = somarMesesCompetencia(competenciaInicial, p - 1)
      competenciasAfetadas.add(compParcela)

      const valorDestaParcela =
        p === qtdParcelas
          ? Number((valorParcelaBase + diferencaCentavos).toFixed(2))
          : valorParcelaBase

      const { data: lancFilho } = await db
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

      await db.from('parcelas').insert({
        workspace_id: dados.workspace_id,
        lancamento_id: lancPai.id,
        numero_parcela: p,
        total_parcelas: qtdParcelas,
        valor: valorDestaParcela,
        competencia: compParcela,
        data_vencimento: dados.data,
        cartao_id: dados.cartao_id,
        status: 'pendente',
      })
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

    // Frente 4: Se for compra parcelada em cartão, operar SEMPRE sobre o original e excluir atomicamente via RPC
    const ehParceladoCartao =
      atual.meio_pagamento_tipo === 'CARTAO' &&
      (atual.regime === 'parcelado' ||
        (atual.total_parcelas || 1) > 1 ||
        Boolean(atual.lancamento_pai_id))

    if (ehParceladoCartao) {
      const paiId = atual.lancamento_pai_id || atual.id
      const res = await this.excluirCompraParcelada(workspaceId, paiId, userId)
      return {
        excluidos: 1,
        faturasRecalculadas: (res as any)?.faturas_recalculadas || [],
      }
    }

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

    // Se o lançamento pertencer a uma compra parcelada, também busca parcelas na tabela parcelas para verificar se há fatura paga
    const paiIdPrincipal = atual.lancamento_pai_id || atual.id
    const { data: parcelasExistentes } = await db
      .from('parcelas')
      .select('competencia, numero_parcela, total_parcelas, cartao_id')
      .eq('lancamento_id', paiIdPrincipal)

    for (const p of parcelasExistentes || []) {
      if (p.cartao_id && p.competencia) {
        const fatura = await faturaService.getFatura(workspaceId, p.cartao_id, p.competencia)
        if (fatura && fatura.status === 'paga') {
          throw new Error(
            `A fatura de ${fatura.competencia} já está paga e contém a parcela (${p.numero_parcela}/${p.total_parcelas}). Para excluir este lançamento, desfaça o pagamento da fatura de ${fatura.competencia} na tela de Cartões.`,
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
        if (l.tipo === 'transferencia') {
          // Reverte saldos de transferência atomicamente e com idempotência garantida
          await db.rpc('restaurar_saldo_transferencia_rpc', {
            p_workspace_id: workspaceId,
            p_lancamento_id: l.id,
          })
        } else {
          // Reverte saldos via RPC atômica idempotente
          await db.rpc('toggle_pago_lancamento_rpc', {
            p_workspace_id: workspaceId,
            p_lancamento_id: l.id,
            p_pago: false,
            p_user_id: userId || null,
          })
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

    // Limpar tabela parcelas vinculadas ao lançamento pai / original e aos alvos
    const paiIds = Array.from(new Set([paiIdPrincipal, ...idsAlvo]))
    await db.from('parcelas').delete().in('lancamento_id', paiIds)

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

  // Frente 4: Regeneração atômica de compra parcelada de cartão via RPC
  async regenerarCompraParcelada(
    workspaceId: string,
    lancamentoId: string,
    dados: {
      valor: number
      data: string
      quantidade_parcelas: number
      descricao: string
      categoria_id?: string | null
      subcategoria_id?: string | null
      observacao?: string | null
      cartao_id?: string | null
    },
    userId?: string,
  ): Promise<any> {
    const { data, error } = await db.rpc('regenerar_parcelas_lancamento', {
      p_workspace_id: workspaceId,
      p_lancamento_id: lancamentoId,
      p_novo_valor: dados.valor,
      p_nova_data: dados.data,
      p_nova_quantidade_parcelas: dados.quantidade_parcelas,
      p_nova_descricao: dados.descricao,
      p_categoria_id: dados.categoria_id || null,
      p_subcategoria_id: dados.subcategoria_id || null,
      p_observacao: dados.observacao || null,
      p_novo_cartao_id: dados.cartao_id || null,
      p_user_id: userId || null,
    })

    if (error) {
      throw new Error(error.message || 'Falha ao regenerar parcelas')
    }

    return data
  },

  // Frente 4: Exclusão atômica de compra parcelada de cartão via RPC
  async excluirCompraParcelada(
    workspaceId: string,
    lancamentoId: string,
    userId?: string,
  ): Promise<any> {
    const { data, error } = await db.rpc('excluir_lancamento_parcelado_rpc', {
      p_workspace_id: workspaceId,
      p_lancamento_id: lancamentoId,
      p_user_id: userId || null,
    })

    if (error) {
      throw new Error(error.message || 'Falha ao excluir compra parcelada')
    }

    return data
  },

  // Build 5: Fixo / Recorrente - Exclusão por escopo delegada para a RPC atômica idempotente com proteção de pagos
  async excluirFixoComEscopo(
    lancamentoId: string,
    workspaceId: string,
    escopo: 'este' | 'este_e_proximos' | 'todos',
    userId?: string,
  ): Promise<{
    sucesso: boolean
    bloqueado?: boolean
    motivo?: string
    datas_pagamento?: string[]
    faturas_pagas?: string[]
    mensagem?: string
    excluidos?: number
    faturas_recalculadas?: string[]
  }> {
    const { data, error } = await db.rpc('excluir_fixo_escopo_rpc', {
      p_workspace_id: workspaceId,
      p_lancamento_id: lancamentoId,
      p_escopo: escopo,
      p_user_id: userId || null,
    })

    if (error) {
      throw new Error(
        error.message ||
          'Não foi possível excluir o lançamento recorrente — verifique e tente novamente; se persistir, atualize a página.',
      )
    }

    const res = data as any
    if (res && res.bloqueado) {
      throw new Error(
        res.mensagem ||
          'Exclusão bloqueada: o escopo selecionado contém lançamentos pagos ou faturas quitadas.',
      )
    }

    return res
  },

  // Build 5: Fixo / Recorrente - Alteração por escopo delegada para a RPC atômica idempotente com proteção de pagos
  async alterarFixoComEscopo(
    lancamentoId: string,
    workspaceId: string,
    escopo: 'todos' | 'este_e_proximos' | 'este',
    novosDados: {
      valor: number
      data: string
      descricao: string
      categoria_id?: string | null
      subcategoria_id?: string | null
      observacao?: string | null
      prazo?: 'indeterminado' | 'determinado' | null
      quantidade_total?: number | null
      periodicidade?: 'mensal' | 'semestral' | 'anual' | null
      meio_pagamento_tipo?: 'CONTA' | 'CARTAO' | 'DINHEIRO' | null
      conta_origem_id?: string | null
      conta_destino_id?: string | null
      cartao_id?: string | null
      pago_primeira?: boolean
    },
    userId?: string,
  ): Promise<{
    sucesso: boolean
    bloqueado?: boolean
    motivo?: string
    datas_pagamento?: string[]
    faturas_pagas?: string[]
    mensagem?: string
    alterados?: number
    pagas_preservadas?: number
    faturas_recalculadas?: string[]
  }> {
    const { data, error } = await db.rpc('alterar_fixo_escopo_rpc', {
      p_workspace_id: workspaceId,
      p_lancamento_id: lancamentoId,
      p_escopo: escopo,
      p_novo_valor: Number(novosDados.valor),
      p_nova_data: novosDados.data,
      p_nova_descricao: novosDados.descricao,
      p_nova_categoria_id: novosDados.categoria_id || null,
      p_nova_subcategoria_id: novosDados.subcategoria_id || null,
      p_nova_observacao: novosDados.observacao || null,
      p_novo_prazo: novosDados.prazo || null,
      p_nova_quantidade_total: novosDados.quantidade_total
        ? Number(novosDados.quantidade_total)
        : null,
      p_nova_periodicidade: novosDados.periodicidade || null,
      p_novo_meio_pagamento_tipo: novosDados.meio_pagamento_tipo || null,
      p_nova_conta_origem_id: novosDados.conta_origem_id || null,
      p_nova_conta_destino_id: novosDados.conta_destino_id || null,
      p_novo_cartao_id: novosDados.cartao_id || null,
      p_pago_primeira: Boolean(novosDados.pago_primeira),
      p_user_id: userId || null,
    })

    if (error) {
      throw new Error(
        error.message ||
          'Não foi possível alterar o lançamento recorrente — verifique e tente novamente; se persistir, atualize a página.',
      )
    }

    const res = data as any
    if (res && res.bloqueado) {
      throw new Error(
        res.mensagem ||
          'Alteração bloqueada: o escopo selecionado contém lançamentos pagos ou faturas fechadas/pagas.',
      )
    }

    return res
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
      quantidade_parcelas?: number
      categoria_id?: string | null
      subcategoria_id?: string | null
      observacao?: string | null
    },
    userId?: string,
  ): Promise<{ alterados: number; faturasRecalculadas: string[] }> {
    const atual = await this.getById(lancamentoId)
    if (!atual) throw new Error('Lançamento não encontrado')

    // Frente 4: Se for compra parcelada em cartão, operar SEMPRE sobre o lançamento original e regenerar
    const ehParceladoCartao =
      atual.meio_pagamento_tipo === 'CARTAO' &&
      (atual.regime === 'parcelado' ||
        (atual.total_parcelas || 1) > 1 ||
        Boolean(atual.lancamento_pai_id))

    if (ehParceladoCartao) {
      const paiId = atual.lancamento_pai_id || atual.id
      const paiObj = paiId === atual.id ? atual : await this.getById(paiId)
      const novoValor =
        novosDados.valor !== undefined
          ? Number(novosDados.valor)
          : Number(paiObj?.valor || atual.valor)
      const novaData = novosDados.data || paiObj?.data || atual.data
      const novaQtd =
        novosDados.quantidade_parcelas !== undefined
          ? Number(novosDados.quantidade_parcelas)
          : Number(
              paiObj?.total_parcelas || paiObj?.quantidade_parcelas || atual.total_parcelas || 1,
            )
      const novaDesc =
        novosDados.descricao !== undefined
          ? novosDados.descricao
          : paiObj?.descricao || atual.descricao

      const res = await this.regenerarCompraParcelada(
        workspaceId,
        paiId,
        {
          valor: novoValor,
          data: novaData,
          quantidade_parcelas: novaQtd,
          descricao: novaDesc,
          categoria_id:
            novosDados.categoria_id !== undefined ? novosDados.categoria_id : paiObj?.categoria_id,
          subcategoria_id:
            novosDados.subcategoria_id !== undefined
              ? novosDados.subcategoria_id
              : paiObj?.subcategoria_id,
          observacao:
            novosDados.observacao !== undefined ? novosDados.observacao : paiObj?.observacao,
          cartao_id:
            (novosDados as any).cartao_id !== undefined
              ? (novosDados as any).cartao_id
              : paiObj?.cartao_id,
        },
        userId,
      )

      return {
        alterados: novaQtd,
        faturasRecalculadas: (res as any)?.faturas_recalculadas || [],
      }
    }

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

    // Validação adicional na tabela parcelas para o lançamento pai
    const paiIdPrincipal = atual.lancamento_pai_id || atual.id
    const { data: parcelasChecagem } = await db
      .from('parcelas')
      .select('competencia, numero_parcela, total_parcelas, cartao_id')
      .eq('lancamento_id', paiIdPrincipal)

    for (const p of parcelasChecagem || []) {
      if (p.cartao_id && p.competencia) {
        const fatura = await faturaService.getFatura(workspaceId, p.cartao_id, p.competencia)
        if (fatura && fatura.status === 'paga') {
          throw new Error(
            `A fatura de ${fatura.competencia} já está paga e contém a parcela (${p.numero_parcela}/${p.total_parcelas}). Para alterar este lançamento, desfaça o pagamento da fatura de ${fatura.competencia} na tela de Cartões para prosseguir.`,
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
      ? faturaService.calcularCompetenciaCartao(
          novaDataBase,
          diaFechamento,
          cartaoObj?.dia_vencimento,
        )
      : novaDataBase.substring(0, 7)

    for (const l of alvos) {
      let novaComp = l.competencia
      let novaDataParcela = l.data

      if (novosDados.data) {
        if (escopo === 'este' || !ehSerie) {
          novaDataParcela = novosDados.data
          novaComp = atual.cartao_id
            ? faturaService.calcularCompetenciaCartao(
                novosDados.data,
                diaFechamento,
                cartaoObj?.dia_vencimento,
              )
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

      // Se for alteração do todo em série parcelada de cartão, o valor recebido é o TOTAL do lançamento original
      if (novosDados.valor !== undefined) {
        if (ehSerie && escopo === 'todos' && atual.meio_pagamento_tipo === 'CARTAO') {
          const novoTotal = Number(novosDados.valor)
          const qtdParc = Number(l.total_parcelas || serieCompleta.length || 1)
          const valorBaseParcela = Math.floor((novoTotal / qtdParc) * 100) / 100
          const diferencaCentavos = Number((novoTotal - valorBaseParcela * qtdParc).toFixed(2))
          const numP = l.numero_parcela || 1

          // Se for o lançamento original pai, guarda o total; se for filho, guarda a parcela calculada
          if (l.id === paiIdPrincipal) {
            updatesItem.valor = novoTotal
          } else {
            updatesItem.valor =
              numP === qtdParc
                ? Number((valorBaseParcela + diferencaCentavos).toFixed(2))
                : valorBaseParcela
          }
        } else {
          updatesItem.valor = Number(novosDados.valor)
        }
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

      // Se existir na tabela parcelas, atualiza valor/competência correspondente na tabela parcelas
      if (novosDados.valor !== undefined || novosDados.data) {
        const numP = l.numero_parcela || 1
        const valParaParcela =
          ehSerie &&
          escopo === 'todos' &&
          atual.meio_pagamento_tipo === 'CARTAO' &&
          novosDados.valor !== undefined
            ? numP === (l.total_parcelas || 1)
              ? Number(
                  (
                    Math.floor((Number(novosDados.valor) / (l.total_parcelas || 1)) * 100) / 100 +
                    Number(
                      (
                        Number(novosDados.valor) -
                        (Math.floor((Number(novosDados.valor) / (l.total_parcelas || 1)) * 100) /
                          100) *
                          (l.total_parcelas || 1)
                      ).toFixed(2),
                    )
                  ).toFixed(2),
                )
              : Math.floor((Number(novosDados.valor) / (l.total_parcelas || 1)) * 100) / 100
            : updatesItem.valor !== undefined
              ? updatesItem.valor
              : l.valor

        await db
          .from('parcelas')
          .update({
            valor: valParaParcela,
            competencia:
              updatesItem.competencia !== undefined ? updatesItem.competencia : l.competencia,
            updated_at: new Date().toISOString(),
          })
          .eq('lancamento_id', paiIdPrincipal)
          .eq('numero_parcela', numP)
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

  // Função unificada atômica para salvar lançamentos (únicos, parcelados ou fixos)
  async salvarUnificado(
    dados: {
      id?: string
      serie_id?: string | null
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
      fixo?: {
        prazo: 'indeterminado' | 'determinado'
        periodicidade: 'mensal' | 'semestral' | 'anual'
        quantidade_total?: number | null
        pago_primeira?: boolean
      } | null
    },
    userId?: string,
  ): Promise<any> {
    const wsId = dados.workspace_id

    // REQUISITO 1: Criação de lançamento fixo/recorrente via RPC atômica criar_serie_fixa_rpc
    if (!dados.id && dados.regime === 'fixo' && dados.fixo) {
      return await fixoService.criarSerieFixa(
        wsId,
        {
          tipo: dados.tipo,
          descricao: dados.descricao,
          valor: Number(dados.valor),
          data_inicio: dados.data,
          prazo: dados.fixo.prazo || 'indeterminado',
          periodicidade: dados.fixo.periodicidade || 'mensal',
          quantidade_total: dados.fixo.quantidade_total
            ? Number(dados.fixo.quantidade_total)
            : null,
          meio_pagamento_tipo: dados.meio_pagamento_tipo,
          conta_origem_id: dados.conta_origem_id || null,
          conta_destino_id: dados.conta_destino_id || null,
          cartao_id: dados.cartao_id || null,
          categoria_id: dados.categoria_id || null,
          subcategoria_id: dados.subcategoria_id || null,
          observacao: dados.observacao || null,
          pago_primeira: Boolean(dados.fixo.pago_primeira),
        },
        userId || dados.created_by,
      )
    }

    // Se for novo (único ou parcelado)
    if (!dados.id) {
      const { fixo: _f, ...restNovo } = dados as any
      return await this.create({
        ...restNovo,
        workspace_id: wsId,
        created_by: userId || dados.created_by,
      })
    }

    // Se for edição de lançamento existente:
    const anterior = await this.getById(dados.id)
    const regimeAnterior = anterior?.regime || 'unico'
    const regimeNovo = dados.regime || 'unico'

    // REQUISITO: Conversão de tipo na edição: permitir mudar ÚNICO ↔ FIXO/PARCELADO
    if (anterior && regimeAnterior !== regimeNovo) {
      return await this.converterRegime(
        wsId,
        dados.id,
        regimeNovo,
        {
          descricao: dados.descricao,
          valor: Number(dados.valor),
          data: dados.data,
          meio_pagamento_tipo: dados.meio_pagamento_tipo,
          conta_origem_id: dados.conta_origem_id,
          conta_destino_id: dados.conta_destino_id,
          cartao_id: dados.cartao_id,
          categoria_id: dados.categoria_id,
          subcategoria_id: dados.subcategoria_id,
          observacao: dados.observacao,
          quantidade_parcelas: dados.quantidade_parcelas,
          prazo: dados.fixo?.prazo,
          periodicidade: dados.fixo?.periodicidade,
          quantidade_total: dados.fixo?.quantidade_total,
        },
        userId || dados.created_by,
      )
    }

    // Remover campos não colunares da tabela lancamentos (como 'fixo', 'created_by', etc)
    const {
      fixo: _fixoParam,
      created_by: _createdByParam,
      serie_id: _serieIdParam,
      ...camposParaAtualizar
    } = dados as any

    return await this.update(dados.id, wsId, camposParaAtualizar, userId)
  },

  // Conversão atômica de tipos na edição (Único <-> Fixo <-> Parcelado)
  async converterRegime(
    workspaceId: string,
    lancamentoId: string,
    novoRegime: 'unico' | 'fixo' | 'parcelado',
    dados: {
      descricao: string
      valor: number
      data: string
      meio_pagamento_tipo: 'CONTA' | 'CARTAO' | 'DINHEIRO'
      conta_origem_id?: string | null
      conta_destino_id?: string | null
      cartao_id?: string | null
      categoria_id?: string | null
      subcategoria_id?: string | null
      observacao?: string | null
      quantidade_parcelas?: number
      prazo?: 'indeterminado' | 'determinado'
      periodicidade?: 'mensal' | 'semestral' | 'anual'
      quantidade_total?: number | null
      pago_primeira?: boolean
    },
    userId?: string,
  ): Promise<any> {
    const { data, error } = await db.rpc('converter_regime_lancamento_rpc', {
      p_workspace_id: workspaceId,
      p_lancamento_id: lancamentoId,
      p_novo_regime: novoRegime,
      p_nova_descricao: dados.descricao,
      p_novo_valor: Number(dados.valor),
      p_nova_data: dados.data,
      p_novo_meio_pagamento: dados.meio_pagamento_tipo,
      p_nova_conta_origem: dados.conta_origem_id || null,
      p_nova_conta_destino: dados.conta_destino_id || null,
      p_novo_cartao_id: dados.cartao_id || null,
      p_nova_categoria_id: dados.categoria_id || null,
      p_nova_subcategoria_id: dados.subcategoria_id || null,
      p_nova_observacao: dados.observacao || null,
      p_nova_quantidade_parcelas: dados.quantidade_parcelas || 1,
      p_novo_prazo: dados.prazo || 'indeterminado',
      p_nova_periodicidade: dados.periodicidade || 'mensal',
      p_novo_total_ocorrencias: dados.quantidade_total ? Number(dados.quantidade_total) : 12,
      p_pago_primeira: Boolean(dados.pago_primeira),
      p_user_id: userId || null,
    })

    if (error) {
      throw new Error(error.message || 'Falha ao converter regime do lançamento.')
    }

    return data
  },

  async update(
    id: string,
    workspaceId: string,
    updates: {
      descricao?: string
      valor?: number
      data?: string
      regime?: 'unico' | 'fixo' | 'parcelado'
      categoria_id?: string | null
      subcategoria_id?: string | null
      status_pagamento?: 'pago' | 'pendente'
      observacao?: string | null
      conta_origem_id?: string | null
      conta_destino_id?: string | null
      cartao_id?: string | null
      meio_pagamento_tipo?: 'CONTA' | 'CARTAO' | 'DINHEIRO'
      quantidade_parcelas?: number
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

    // Execução atômica no PostgreSQL com SELECT FOR UPDATE para estorno/movimentação de saldos
    const meioFinal = updates.meio_pagamento_tipo || anterior.meio_pagamento_tipo
    const statusDesejado =
      meioFinal === 'CARTAO'
        ? 'pendente'
        : (updates.status_pagamento ?? anterior.status_pagamento ?? 'pendente')

    const dataFinal = updates.data || anterior.data
    const valorFinal = updates.valor !== undefined ? Number(updates.valor) : Number(anterior.valor)
    const descricaoFinal = (
      updates.descricao !== undefined ? updates.descricao : anterior.descricao
    ).trim()

    const { data: resAtomico, error: errAtomico } = await db.rpc('editar_lancamento_atomico_rpc', {
      p_workspace_id: workspaceId,
      p_lancamento_id: id,
      p_descricao: descricaoFinal,
      p_valor: valorFinal,
      p_data: dataFinal,
      p_meio_pagamento_tipo: meioFinal,
      p_conta_origem_id:
        updates.conta_origem_id !== undefined ? updates.conta_origem_id : anterior.conta_origem_id,
      p_conta_destino_id:
        updates.conta_destino_id !== undefined
          ? updates.conta_destino_id
          : anterior.conta_destino_id,
      p_cartao_id: updates.cartao_id !== undefined ? updates.cartao_id : anterior.cartao_id,
      p_categoria_id:
        updates.categoria_id !== undefined ? updates.categoria_id : anterior.categoria_id,
      p_subcategoria_id:
        updates.subcategoria_id !== undefined ? updates.subcategoria_id : anterior.subcategoria_id,
      p_status_pagamento: statusDesejado,
      p_observacao: updates.observacao !== undefined ? updates.observacao : anterior.observacao,
      p_quantidade_parcelas: updates.quantidade_parcelas || anterior.quantidade_parcelas || 1,
      p_user_id: userId || null,
    })

    if (errAtomico) {
      throw new Error(errAtomico.message || 'Falha ao salvar edição do lançamento.')
    }

    if (resAtomico && !resAtomico.sucesso) {
      throw new Error(resAtomico.mensagem || 'Não foi possível alterar o lançamento.')
    }

    const updated = await this.getById(id)
    return updated
  },

  async softDelete(id: string, workspaceId: string, userId?: string): Promise<void> {
    const anterior = await this.getById(id)
    if (!anterior) throw new Error('Lançamento não encontrado')

    // Idempotência prévia: se já foi excluído, encerra sem duplicar
    if (anterior.deleted_at) {
      return
    }

    // BLOCO B (Teste 13): Bloqueio de exclusão em lançamento ÚNICO pago
    if (
      anterior.status_pagamento === 'pago' &&
      anterior.meio_pagamento_tipo !== 'CARTAO' &&
      (anterior.regime === 'unico' || !anterior.serie_id)
    ) {
      throw new Error('Este lançamento está pago. É necessário desfazer o pagamento para excluir.')
    }

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

    // Se for transferência, chamar a RPC atômica idempotente com trava
    if (anterior.tipo === 'transferencia') {
      const { data: resTransf, error: errTransf } = await db.rpc('excluir_transferencia_rpc', {
        p_workspace_id: workspaceId,
        p_lancamento_id: id,
        p_user_id: userId || null,
      })
      if (errTransf) {
        throw new Error(
          errTransf.message ||
            'Não foi possível excluir a transferência — verifique e tente novamente; se persistir, atualize a página.',
        )
      }
      if (resTransf && !resTransf.sucesso) {
        throw new Error(resTransf.mensagem || 'Não foi possível excluir a transferência.')
      }
      return
    }

    // Se estava pago, reverter saldo atomicamente
    if (anterior.status_pagamento === 'pago') {
      await db.rpc('toggle_pago_lancamento_rpc', {
        p_workspace_id: workspaceId,
        p_lancamento_id: id,
        p_pago: false,
        p_user_id: userId || null,
      })
    }

    // Excluir movimentações da conta
    await db.from('movimentacoes_conta').delete().eq('lancamento_id', id)

    // Identificar lançamento pai / série caso seja um lançamento parcelado
    // Se for transferência, chamar a RPC atômica idempotente com trava
    if (anterior.tipo === 'transferencia') {
      const { data: resTransf, error: errTransf } = await db.rpc('excluir_transferencia_rpc', {
        p_workspace_id: workspaceId,
        p_lancamento_id: id,
        p_user_id: userId || null,
      })
      if (errTransf) {
        throw new Error(errTransf.message || 'Falha ao excluir transferência.')
      }
      return
    }

    const paiId = anterior.lancamento_pai_id || anterior.id
    const idsParaExcluir = [id]
    if (paiId && paiId === anterior.id) {
      // Se estamos excluindo o lançamento original (pai), marcar também os filhos
      const { data: filhos } = await db
        .from('lancamentos')
        .select('id')
        .eq('lancamento_pai_id', paiId)
        .eq('workspace_id', workspaceId)
      if (filhos && filhos.length > 0) {
        filhos.forEach((f) => idsParaExcluir.push(f.id))
      }
    }

    // Soft delete
    const { error } = await db
      .from('lancamentos')
      .update({
        deleted_at: new Date().toISOString(),
        status_pagamento: 'cancelado',
        updated_at: new Date().toISOString(),
      })
      .in('id', idsParaExcluir)
      .eq('workspace_id', workspaceId)

    if (error) throw error

    // Remover da tabela parcelas se existir (tanto sob o id quanto sob o pai)
    await db.from('parcelas').delete().in('lancamento_id', [id, paiId])

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

  async togglePago(id: string, workspaceId: string, pago: boolean, userId?: string): Promise<any> {
    // 1. Verificação prévia no banco
    const anterior = await this.getById(id)
    if (!anterior) throw new Error('Lançamento não encontrado')

    if (anterior.meio_pagamento_tipo === 'CARTAO') {
      throw new Error(
        'Lançamentos em cartão de crédito são quitados através do pagamento da fatura.',
      )
    }

    const statusAtualPago = anterior.status_pagamento === 'pago'
    if ((pago && statusAtualPago) || (!pago && !statusAtualPago)) {
      // Já está no estado pretendido, nenhuma ação necessária
      return { sucesso: true, ja_no_estado: true }
    }

    // 2. Executar via RPC atômica e idempotente no PostgreSQL (com FOR UPDATE)
    const { data, error } = await db.rpc('toggle_pago_lancamento_rpc', {
      p_workspace_id: workspaceId,
      p_lancamento_id: id,
      p_pago: pago,
      p_user_id: userId || null,
    })

    if (error) {
      throw new Error(
        error.message ||
          'Não foi possível alterar o status do pagamento — verifique e clique novamente; se persistir, atualize a página.',
      )
    }

    await auditoriaService.registrar({
      workspace_id: workspaceId,
      entidade: 'lancamentos',
      entidade_id: id,
      acao: pago ? 'pay_transaction' : 'unpay_transaction',
      estado_anterior: anterior,
      estado_posterior: { ...anterior, status_pagamento: pago ? 'pago' : 'pendente' },
      created_by: userId,
    })

    return data
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
