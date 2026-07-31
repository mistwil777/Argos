import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { api } from '@/services/api'
import { useAuth } from '@/context/AuthContext'

export default function Register() {
  const { login } = useAuth()
  const navigate   = useNavigate()

  const [fullName, setFullName] = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError('Mot de passe trop court (min 8 caractères)'); return }
    setLoading(true)
    try {
      await api.register(email, password, fullName)
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la création du compte')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--bg))] dot-grid flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-widest mb-1">
            Système de veille
          </p>
          <h1 className="text-[28px] font-bold text-[hsl(var(--text))] tracking-tight">Argos</h1>
        </div>

        <div className="panel overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-[hsl(var(--accent-line))] to-transparent" />
          <div className="p-6 space-y-4">
            <h2 className="text-[15px] font-bold text-[hsl(var(--text))]">Créer un compte</h2>

            {error && (
              <div className="px-3 py-2 rounded bg-[hsl(var(--red)/.1)] border border-[hsl(var(--red)/.3)] text-[12px] text-[hsl(var(--red))]">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider block mb-1">
                  Nom complet
                </label>
                <input
                  type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                  autoFocus autoComplete="name" name="name"
                  className="w-full bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded px-3 py-2
                             text-[13px] text-[hsl(var(--text))] outline-none
                             focus:border-[hsl(var(--accent-line))] transition-colors"
                  placeholder="Prénom Nom"
                />
              </div>
              <div>
                <label className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider block mb-1">
                  Email
                </label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  autoComplete="email" name="email"
                  className="w-full bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded px-3 py-2
                             text-[13px] text-[hsl(var(--text))] outline-none
                             focus:border-[hsl(var(--accent-line))] transition-colors"
                  placeholder="vous@exemple.fr"
                />
              </div>
              <div>
                <label className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider block mb-1">
                  Mot de passe
                </label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)} required
                    autoComplete="new-password" name="password"
                    className="w-full bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded px-3 py-2 pr-9
                               text-[13px] text-[hsl(var(--text))] outline-none
                               focus:border-[hsl(var(--accent-line))] transition-colors"
                    placeholder="min. 8 caractères"
                  />
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))]">
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <motion.button
                type="submit" disabled={loading} whileTap={{ scale: 0.97 }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded
                           bg-[hsl(var(--accent))] text-white text-[13px] font-bold
                           hover:opacity-90 disabled:opacity-50 transition-opacity mt-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Créer mon compte'}
              </motion.button>
            </form>
          </div>

          <div className="px-6 py-3 border-t border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] text-center">
            <p className="text-[11.5px] text-[hsl(var(--text-3))]">
              Déjà un compte ?{' '}
              <Link to="/login" className="text-[hsl(var(--accent))] hover:underline font-medium">
                Se connecter
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
