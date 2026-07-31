import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '@/services/api'

interface User {
  id: number
  email: string
  full_name?: string
  role: string
  onboarding_done: boolean
}

interface AuthContextType {
  user: User | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  updateOnboardingDone: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null)
  const [token, setToken]     = useState<string | null>(() => localStorage.getItem('argos_token'))
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!token) { setIsLoading(false); return }
    api.me()
      .then(u => setUser(u))
      .catch(() => { localStorage.removeItem('argos_token'); setToken(null) })
      .finally(() => setIsLoading(false))
  }, [token])

  async function login(email: string, password: string) {
    const res = await api.login(email, password)
    localStorage.setItem('argos_token', res.access_token)
    setToken(res.access_token)
    setUser(res.user)
  }

  function logout() {
    localStorage.removeItem('argos_token')
    setToken(null)
    setUser(null)
  }

  async function updateOnboardingDone() {
    const updated = await api.updateMe({ onboarding_done: true })
    setUser(updated)
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, updateOnboardingDone }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
