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
