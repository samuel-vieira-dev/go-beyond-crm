import { NavLink } from 'react-router-dom'
import { LogoLockup } from './Logo'
import { NAV_BY_ROLE } from './nav'
import { useAuth } from '@/context/AuthContext'
import { useActivityReminders } from '@/context/ActivityRemindersContext'
import { ROLE_LABELS } from '@/types/domain'
import { cn } from '@/lib/cn'

export function Sidebar() {
  const { profile, signOut } = useAuth()
  const { pendingCount, overdueCount } = useActivityReminders()
  if (!profile) return null

  const items = NAV_BY_ROLE[profile.role]

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-navy-950/60 p-4">
      <LogoLockup className="mb-8 px-2" />

      <nav className="flex-1 space-y-1 overflow-y-auto">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-gold-500/15 text-gold-400'
                  : 'text-white/60 hover:bg-white/5 hover:text-white',
              )
            }
          >
            <span className="text-base">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.to.endsWith('/alertas') && pendingCount > 0 && (
              <span
                className={cn(
                  'flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold',
                  overdueCount > 0 ? 'bg-danger text-white' : 'bg-gold-500 text-navy-950',
                )}
              >
                {pendingCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-4 border-t border-white/10 pt-4">
        <p className="truncate px-2 text-sm font-medium text-white">{profile.full_name}</p>
        <p className="px-2 text-xs text-white/40">{ROLE_LABELS[profile.role]}</p>
        <button
          onClick={() => signOut()}
          className="mt-3 w-full rounded-lg px-3 py-2 text-left text-sm text-white/50 hover:bg-white/5 hover:text-white"
        >
          Sair
        </button>
      </div>
    </aside>
  )
}
