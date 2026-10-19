import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'

export interface UserProfile {
  id: string
  nome: string
  email: string
  moeda: string
  timezone: string
  avatar_url?: string | null
}

export interface WorkspaceMemberInfo {
  id: string
  workspace_id: string
  workspace_nome: string
  perfil: 'Administrador' | 'Cliente' | 'Colaborador'
  status: 'ativo' | 'inativo' | 'pendente'
  is_owner: boolean
}

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: UserProfile | null
  workspaces: WorkspaceMemberInfo[]
  currentWorkspace: WorkspaceMemberInfo | null
  setCurrentWorkspace: (ws: WorkspaceMemberInfo) => void
  signUp: (email: string, password: string, nome?: string) => Promise<{ error: any }>
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signOut: () => Promise<{ error: any }>
  refreshProfileAndWorkspaces: () => Promise<void>
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [workspaces, setWorkspaces] = useState<WorkspaceMemberInfo[]>([])
  const [currentWorkspace, setCurrentWorkspaceState] = useState<WorkspaceMemberInfo | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfileAndWorkspaces = async (userId: string) => {
    try {
      const db = supabase as any

      // 1. Busca perfil
      const { data: prof } = await db.from('profiles').select('*').eq('id', userId).maybeSingle()

      if (prof) {
        setProfile(prof as UserProfile)
      }

      // 2. Busca memberships com o nome do workspace
      const { data: members } = await db
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
            ativo
          )
        `)
        .eq('user_id', userId)
        .eq('status', 'ativo')

      let wsList: WorkspaceMemberInfo[] = (members || [])
        .map((m: any) => {
          const wsObj = Array.isArray(m.workspaces) ? m.workspaces[0] : m.workspaces
          if (!wsObj || wsObj.ativo === false) return null
          return {
            id: m.id,
            workspace_id: m.workspace_id,
            workspace_nome: wsObj.nome,
            perfil: (m.perfil ||
              (wsObj.owner_user_id === userId
                ? 'Administrador'
                : 'Colaborador')) as WorkspaceMemberInfo['perfil'],
            status: (m.status || 'ativo') as WorkspaceMemberInfo['status'],
            is_owner: wsObj.owner_user_id === userId,
          }
        })
        .filter(Boolean) as WorkspaceMemberInfo[]

      // Se nenhum workspace foi retornado via join ou se houve erro/incompletude, busca também workspaces onde é membro ou owner
      if (wsList.length === 0) {
        // Fallback 1: Buscar diretamente todos os workspaces que o usuário tem permissão de SELECT
        const { data: allWs } = await db
          .from('workspaces')
          .select('id, nome, owner_user_id, ativo')
          .eq('ativo', true)

        if (allWs && allWs.length > 0) {
          // Também busca members simples para saber o perfil exato
          const { data: directMembers } = await db
            .from('workspace_members')
            .select('workspace_id, perfil, status')
            .eq('user_id', userId)

          const memberMap = new Map((directMembers || []).map((dm: any) => [dm.workspace_id, dm]))

          wsList = allWs.map((w: any) => {
            const m = memberMap.get(w.id) as any
            const isOwner = w.owner_user_id === userId
            return {
              id: w.id,
              workspace_id: w.id,
              workspace_nome: w.nome,
              perfil: (m?.perfil ||
                (isOwner ? 'Administrador' : 'Colaborador')) as WorkspaceMemberInfo['perfil'],
              status: (m?.status || 'ativo') as WorkspaceMemberInfo['status'],
              is_owner: isOwner,
            }
          })

          // Garante registro em workspace_members para workspaces onde ele é owner
          for (const w of allWs) {
            if (w.owner_user_id === userId && !memberMap.has(w.id)) {
              await db
                .from('workspace_members')
                .upsert(
                  {
                    workspace_id: w.id,
                    user_id: userId,
                    perfil: 'Administrador',
                    status: 'ativo',
                  },
                  { onConflict: 'workspace_id,user_id' },
                )
                .catch(() => null)
            }
          }
        }
      }

      // Se ainda assim não existir nenhum workspace, cria um automaticamente para o usuário
      if (wsList.length === 0) {
        const defaultNome = `Família ${prof?.nome || user?.email?.split('@')[0] || 'Principal'}`
        try {
          const { data: newWs } = await db
            .from('workspaces')
            .insert({
              nome: defaultNome,
              owner_user_id: userId,
              ativo: true,
            })
            .select()
            .single()

          if (newWs) {
            await db.from('workspace_members').insert({
              workspace_id: newWs.id,
              user_id: userId,
              perfil: 'Administrador',
              status: 'ativo',
            })

            wsList = [
              {
                id: newWs.id,
                workspace_id: newWs.id,
                workspace_nome: newWs.nome,
                perfil: 'Administrador',
                status: 'ativo',
                is_owner: true,
              },
            ]
          }
        } catch (e) {
          console.warn('Erro ao auto-provisionar workspace:', e)
        }
      }

      // Ordena workspaces priorizando espaços onde o usuário é membro convidado caso seu workspace owner esteja vazio,
      // ou preservando a preferência
      setWorkspaces(wsList)

      // Define workspace corrente se houver salvo no localStorage e válido para o usuário
      const savedWsId = localStorage.getItem('sap_active_workspace_id')
      const found = wsList.find((w) => w.workspace_id === savedWsId)
      if (found) {
        setCurrentWorkspaceState(found)
        localStorage.setItem('sap_active_workspace_id', found.workspace_id)
      } else if (wsList.length > 0) {
        // Se houver mais de um workspace, prioriza o espaço com mais membros / espaço compartilhado (não-owner) se existir
        const sharedWs = wsList.find((w) => !w.is_owner) || wsList[0]
        setCurrentWorkspaceState(sharedWs)
        localStorage.setItem('sap_active_workspace_id', sharedWs.workspace_id)
      } else {
        setCurrentWorkspaceState(null)
      }
    } catch (err) {
      console.error('Erro ao carregar dados do usuário:', err)
    }
  }

  const setCurrentWorkspace = (ws: WorkspaceMemberInfo) => {
    setCurrentWorkspaceState(ws)
    localStorage.setItem('sap_active_workspace_id', ws.workspace_id)
  }

  const refreshProfileAndWorkspaces = async () => {
    if (user?.id) {
      await fetchProfileAndWorkspaces(user.id)
    }
  }

  useEffect(() => {
    let isMounted = true

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // FORBIDDEN: no async/await inside this callback — sync only
      setSession(session)
      const newUser = session?.user ?? null
      setUser(newUser)
      if (!newUser) {
        setProfile(null)
        setWorkspaces([])
        setCurrentWorkspaceState(null)
        setLoading(false)
      }
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return
      setSession(session)
      const newUser = session?.user ?? null
      setUser(newUser)
      if (newUser) {
        fetchProfileAndWorkspaces(newUser.id).finally(() => {
          if (isMounted) setLoading(false)
        })
      } else {
        setLoading(false)
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  // Effect para atualizar workspaces sempre que user mudar (ex: login/logout)
  useEffect(() => {
    if (user?.id) {
      fetchProfileAndWorkspaces(user.id)
    }
  }, [user?.id])

  const signUp = async (email: string, password: string, nome?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name: nome || email.split('@')[0] },
        emailRedirectTo: `${window.location.origin}/`,
      },
    })
    return { error }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signOut = async () => {
    localStorage.removeItem('sap_active_workspace_id')
    const { error } = await supabase.auth.signOut()
    return { error }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        workspaces,
        currentWorkspace,
        setCurrentWorkspace,
        signUp,
        signIn,
        signOut,
        refreshProfileAndWorkspaces,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
