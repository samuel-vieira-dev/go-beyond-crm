import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { homeForRole } from '@/routes/ProtectedRoute'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Field'
import { LogoLockup } from '@/components/layout/Logo'
import { LoadingScreen } from '@/components/ui/LoadingScreen'

export function LoginPage() {
  const { session, profile, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) return <LoadingScreen />
  if (session && profile) return <Navigate to={homeForRole(profile.role)} replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)
    if (error) {
      setError('Email ou senha inválidos.')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card-surface w-full max-w-sm rounded-2xl p-8">
        <LogoLockup className="mb-8 justify-center" />
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@gobeyond.com"
            />
          </div>
          <div>
            <Label>Senha</Label>
            <Input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-white/40">
          Acesso apenas para equipe Go Beyond. Fale com a Gestão se precisar de uma conta.
        </p>
      </div>
    </div>
  )
}
