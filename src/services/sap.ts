import { supabase } from '@/lib/supabase/client'
import { WorkspaceMember, AuditoriaOperacao, UserProfileData } from '@/types/sap'

const db = supabase as any

export const workspaceService = {
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
    const { data, error } = await db
      .from('workspace_members')
      .select(`
        id,
        workspace_id,
        user_id,
        perfil,
        status,
        invited_at,
        accepted_at,
        created_at,
        profiles (
          nome,
          email
        )
      `)
      .eq('workspace_id', workspaceId)

    if (error) throw error

    return (data || []).map((m: any) => ({
      id: m.id,
      workspace_id: m.workspace_id,
      user_id: m.user_id,
      perfil: m.perfil,
      status: m.status,
      invited_at: m.invited_at,
      accepted_at: m.accepted_at,
      created_at: m.created_at,
      user_nome: m.profiles?.nome || 'Usuário',
      user_email: m.profiles?.email || '',
    }))
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

    // Buscar faturas abertas do mês corrente para calcular consumo
    const cartoes = (data || []).map((c: any) => ({
      ...c,
      limite: Number(c.limite || 0),
      fatura_atual: 0,
    }))

    // Buscar total de faturas abertas para cada cartão
    try {
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
    } catch (e) {
      console.warn('Erro ao carregar faturas de cartões:', e)
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

  async createDinheiro(workspaceId: string, nome = 'Dinheiro em Espécie'): Promise<any> {
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
    return data
  },

  async toggleAtivo(id: string, workspaceId: string, ativo: boolean): Promise<any> {
    const { data, error } = await db
      .from('meios_pagamento')
      .update({ ativo })
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select()
      .single()

    if (error) throw error
    return data
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

  async criarRapido(dados: {
    workspace_id: string
    tipo: 'despesa' | 'receita' | 'transferencia'
    descricao: string
    valor: number
    data: string
    competencia: string
    meio_pagamento_tipo: 'CONTA' | 'CARTAO' | 'DINHEIRO'
    conta_origem_id?: string | null
    conta_destino_id?: string | null
    cartao_id?: string | null
    categoria_id?: string | null
    subcategoria_id?: string | null
    observacao?: string
    created_by?: string
  }): Promise<any> {
    const { data, error } = await db
      .from('lancamentos')
      .insert({
        workspace_id: dados.workspace_id,
        tipo: dados.tipo,
        regime: 'unico',
        descricao: dados.descricao.trim(),
        valor: Number(dados.valor),
        data: dados.data,
        competencia: dados.competencia,
        meio_pagamento_tipo: dados.meio_pagamento_tipo,
        conta_origem_id: dados.conta_origem_id || null,
        conta_destino_id: dados.conta_destino_id || null,
        cartao_id: dados.cartao_id || null,
        categoria_id: dados.categoria_id || null,
        subcategoria_id: dados.subcategoria_id || null,
        status_pagamento: 'pago',
        data_pagamento: dados.data,
        observacao: dados.observacao || null,
        created_by: dados.created_by,
      })
      .select()
      .single()

    if (error) throw error

    // Se envolve conta, atualiza o saldo_atual da conta
    if (dados.tipo === 'despesa' && dados.conta_origem_id) {
      const conta = await contaService.getById(dados.conta_origem_id)
      if (conta) {
        const novoSaldo = Number(conta.saldo_atual) - Number(dados.valor)
        await db
          .from('contas')
          .update({ saldo_atual: novoSaldo, updated_at: new Date().toISOString() })
          .eq('id', dados.conta_origem_id)
      }
    } else if (dados.tipo === 'receita' && dados.conta_origem_id) {
      const conta = await contaService.getById(dados.conta_origem_id)
      if (conta) {
        const novoSaldo = Number(conta.saldo_atual) + Number(dados.valor)
        await db
          .from('contas')
          .update({ saldo_atual: novoSaldo, updated_at: new Date().toISOString() })
          .eq('id', dados.conta_origem_id)
      }
    } else if (dados.tipo === 'transferencia' && dados.conta_origem_id && dados.conta_destino_id) {
      const cOrigem = await contaService.getById(dados.conta_origem_id)
      const cDestino = await contaService.getById(dados.conta_destino_id)
      if (cOrigem && cDestino) {
        await db
          .from('contas')
          .update({
            saldo_atual: Number(cOrigem.saldo_atual) - Number(dados.valor),
            updated_at: new Date().toISOString(),
          })
          .eq('id', dados.conta_origem_id)

        await db
          .from('contas')
          .update({
            saldo_atual: Number(cDestino.saldo_atual) + Number(dados.valor),
            updated_at: new Date().toISOString(),
          })
          .eq('id', dados.conta_destino_id)
      }
    }

    await auditoriaService.registrar({
      workspace_id: dados.workspace_id,
      entidade: 'lancamentos',
      entidade_id: data.id,
      acao: 'create_rapido',
      estado_posterior: data,
      created_by: dados.created_by,
    })

    return data
  },
}
