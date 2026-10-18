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

      const wsList: WorkspaceMemberInfo[] = (members || [])
        .filter((m: any) => m.workspaces && m.workspaces.ativo)
        .map((m: any) => ({
          id: m.id,
          workspace_id: m.workspace_id,
          workspace_nome: m.workspaces.nome,
          perfil: m.perfil,
          status: m.status,
          is_owner: m.workspaces.owner_user_id === userId,
        }))

      setWorkspaces(wsList)

      // Define workspace corrente se houver salvo no localStorage ou o primeiro
      const savedWsId = localStorage.getItem('sap_active_workspace_id')
      const found = wsList.find((w) => w.workspace_id === savedWsId)
      if (found) {
        setCurrentWorkspaceState(found)
      } else if (wsList.length > 0) {
        setCurrentWorkspaceState(wsList[0])
        localStorage.setItem('sap_active_workspace_id', wsList[0].workspace_id)
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
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // FORBIDDEN: no async/await inside this callback — sync only
      setSession(session)
      const newUser = session?.user ?? null
      setUser(newUser)
      setLoading(false)
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Effect para carregar perfil e workspaces sempre que user mudar
  useEffect(() => {
    if (user?.id) {
      fetchProfileAndWorkspaces(user.id)
    } else {
      setProfile(null)
      setWorkspaces([])
      setCurrentWorkspaceState(null)
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
