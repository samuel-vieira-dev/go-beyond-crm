import type { Role } from '@/types/domain'

export interface NavItem {
  to: string
  label: string
  icon: string
  end?: boolean
}

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  sdr: [
    { to: '/sdr', label: 'Leads', icon: '📋', end: true },
    { to: '/sdr/alertas', label: 'Alertas', icon: '🔔' },
    { to: '/sdr/relatorio', label: 'Relatório do dia', icon: '📊' },
  ],
  social_seller: [
    { to: '/social', label: 'Leads', icon: '📋', end: true },
    { to: '/social/alertas', label: 'Alertas', icon: '🔔' },
    { to: '/social/relatorio', label: 'Relatório do dia', icon: '📊' },
  ],
  closer: [
    { to: '/closer', label: 'Agenda', icon: '🗓️', end: true },
    { to: '/closer/leads', label: 'Leads', icon: '📋' },
    { to: '/closer/alertas', label: 'Alertas', icon: '🔔' },
    { to: '/closer/relatorio', label: 'Relatório do dia', icon: '📊' },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', icon: '📈', end: true },
    { to: '/admin/kanban', label: 'Operação', icon: '🗂️' },
    { to: '/admin/conversoes', label: 'Conversões', icon: '🔻' },
    { to: '/admin/ranking-prevendas', label: 'Performance Pré-vendas', icon: '🏆' },
    { to: '/admin/ranking-closers', label: 'Performance Closers', icon: '🥇' },
    { to: '/admin/equipe', label: 'Equipe', icon: '👥' },
    { to: '/admin/produtos', label: 'Produtos', icon: '🏷️' },
    { to: '/admin/metas', label: 'Metas', icon: '🎯' },
    { to: '/admin/quiz', label: 'Dashboard Quiz', icon: '📉' },
  ],
}
