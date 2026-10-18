import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured, UserProfile } from '@/lib/supabase'
import { getUserProfile, updateUserProfile } from '@/lib/stocks-service'

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: UserProfile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: Error | null }>
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>
  refreshProfile: () => Promise<void>
  updateProfileData: (updates: Partial<UserProfile>) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const LOCAL_SESSION_KEY = 'pulse_equity_auth_session_v1'

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  // Load active session on start
  useEffect(() => {
    let isMounted = true

    async function initializeAuth() {
      try {
        if (isSupabaseConfigured) {
          const { data } = await supabase.auth.getSession()
          if (!isMounted) return

          if (data.session) {
            setSession(data.session)
            setUser(data.session.user)
            const prof = await getUserProfile(data.session.user.id, data.session.user.email || '')
            if (isMounted) setProfile(prof)
          } else {
            checkLocalFallbackSession()
          }

          const {
            data: { subscription },
          } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
            if (!isMounted) return
            setSession(newSession)
            setUser(newSession?.user ?? null)
            if (newSession?.user) {
              const prof = await getUserProfile(newSession.user.id, newSession.user.email || '')
              if (isMounted) setProfile(prof)
            } else {
              if (isMounted) setProfile(null)
            }
          })

          return () => {
            subscription.unsubscribe()
          }
        } else {
          checkLocalFallbackSession()
        }
      } catch (err) {
        console.warn('Auth init failed, continuing with fallback:', err)
        checkLocalFallbackSession()
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    function checkLocalFallbackSession() {
      try {
        const stored = localStorage.getItem(LOCAL_SESSION_KEY)
        if (stored) {
          const parsed = JSON.parse(stored)
          if (parsed && parsed.user) {
            setUser(parsed.user)
            setSession(parsed.session || null)
            getUserProfile(parsed.user.id, parsed.user.email).then((prof) => {
              if (isMounted) setProfile(prof)
            })
            return
          }
        }

        // Default initial demo user if brand new session
        const demoUser: User = {
          id: 'demo-user-100',
          app_metadata: {},
          user_metadata: { full_name: 'Guilherme Silva' },
          aud: 'authenticated',
          created_at: new Date().toISOString(),
          email: 'guilherme.silva@pulse.com.br',
          phone: '',
          role: 'authenticated',
          updated_at: new Date().toISOString(),
        }
        setUser(demoUser)
        setSession({
          access_token: 'mock-token',
          refresh_token: 'mock-refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user: demoUser,
        } as Session)
        getUserProfile(demoUser.id, demoUser.email || '').then((prof) => {
          if (isMounted) {
            setProfile({
              ...prof,
              full_name: 'Guilherme Silva',
            })
          }
        })
      } catch {
        // ignore
      }
    }

    initializeAuth()

    return () => {
      isMounted = false
    }
  }, [])

  const refreshProfile = async () => {
    if (user) {
      const prof = await getUserProfile(user.id, user.email || '')
      setProfile(prof)
    }
  }

  const updateProfileData = async (updates: Partial<UserProfile>) => {
    if (user) {
      const updated = await updateUserProfile(user.id, updates)
      setProfile(updated)
    }
  }

  const signIn = async (email: string, password: string) => {
    try {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) return { error }
        if (data.user) {
          setUser(data.user)
          setSession(data.session)
          const prof = await getUserProfile(data.user.id, data.user.email || '')
          setProfile(prof)
        }
        return { error: null }
      }

      // Local mock login
      const mockUser: User = {
        id: `user-${email.replace(/[^a-zA-Z0-9]/g, '') || 'default'}`,
        app_metadata: {},
        user_metadata: { full_name: email.split('@')[0].toUpperCase() },
        aud: 'authenticated',
        created_at: new Date().toISOString(),
        email,
        phone: '',
        role: 'authenticated',
        updated_at: new Date().toISOString(),
      }
      setUser(mockUser)
      const mockSession = {
        access_token: 'mock-token',
        refresh_token: 'mock-refresh',
        expires_in: 3600,
        token_type: 'bearer',
        user: mockUser,
      } as Session
      setSession(mockSession)
      localStorage.setItem(
        LOCAL_SESSION_KEY,
        JSON.stringify({ user: mockUser, session: mockSession }),
      )

      const prof = await getUserProfile(mockUser.id, email)
      setProfile(prof)
      return { error: null }
    } catch (err: any) {
      return { error: err }
    }
  }

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        })
        if (error) return { error }
        if (data.user) {
          setUser(data.user)
          setSession(data.session)
          await updateUserProfile(data.user.id, { full_name: fullName })
          const prof = await getUserProfile(data.user.id, email)
          setProfile(prof)
        }
        return { error: null }
      }

      // Local mock sign up
      const mockUser: User = {
        id: `user-${Date.now()}`,
        app_metadata: {},
        user_metadata: { full_name: fullName },
        aud: 'authenticated',
        created_at: new Date().toISOString(),
        email,
        phone: '',
        role: 'authenticated',
        updated_at: new Date().toISOString(),
      }
      setUser(mockUser)
      const mockSession = {
        access_token: 'mock-token',
        refresh_token: 'mock-refresh',
        expires_in: 3600,
        token_type: 'bearer',
        user: mockUser,
      } as Session
      setSession(mockSession)
      localStorage.setItem(
        LOCAL_SESSION_KEY,
        JSON.stringify({ user: mockUser, session: mockSession }),
      )

      await updateUserProfile(mockUser.id, { full_name: fullName })
      setProfile({
        id: `prof-${mockUser.id}`,
        user_id: mockUser.id,
        full_name: fullName,
        avatar_url: null,
        currency: 'BRL',
        email_signals: true,
        price_alerts: true,
      })
      return { error: null }
    } catch (err: any) {
      return { error: err }
    }
  }

  const signOut = async () => {
    if (isSupabaseConfigured) {
      try {
        await supabase.auth.signOut()
      } catch {
        // ignore
      }
    }
    setUser(null)
    setSession(null)
    setProfile(null)
    localStorage.removeItem(LOCAL_SESSION_KEY)
  }

  const resetPassword = async (email: string) => {
    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/configuracoes`,
        })
        return { error }
      } catch (err: any) {
        return { error: err }
      }
    }
    return { error: null }
  }

  const updatePassword = async (newPassword: string) => {
    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase.auth.updateUser({ password: newPassword })
        return { error }
      } catch (err: any) {
        return { error: err }
      }
    }
    return { error: null }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        signIn,
        signUp,
        signOut,
        resetPassword,
        updatePassword,
        refreshProfile,
        updateProfileData,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
