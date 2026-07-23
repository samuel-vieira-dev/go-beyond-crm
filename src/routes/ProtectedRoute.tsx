import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import type { Role } from '@/types/domain'
import { LoadingScreen } from '@/components/ui/LoadingScreen'

const HOME_BY_ROLE: Record<Role, string> = {
  admin: '/admin',
  sdr: '/sdr',
  social_seller: '/social',
  closer: '/closer',
}

export function homeForRole(role: Role) {
  return HOME_BY_ROLE[role]
}

export function ProtectedRoute({ allow }: { allow: Role[] }) {
  const { session, profile, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace />
  if (!profile) return <LoadingScreen />
  if (!profile.active) return <Navigate to="/login" replace />

  if (!allow.includes(profile.role)) {
    return <Navigate to={homeForRole(profile.role)} replace />
  }

  return <Outlet />
}
