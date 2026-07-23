import type { MeetingStatus } from '@/types/domain'

export const START_HOUR = 6
export const END_HOUR = 22
export const HOUR_HEIGHT = 48

export type CalendarView = 'month' | 'week' | 'day'

export const STATUS_COLOR: Record<MeetingStatus, { bg: string; text: string; dot: string; label: string }> = {
  agendada: { bg: 'rgba(239,175,85,0.9)', text: '#0a1230', dot: '#efaf55', label: 'Agendada' },
  realizada: { bg: 'rgba(34,197,94,0.9)', text: '#052e13', dot: '#22c55e', label: 'Realizada' },
  nao_compareceu: { bg: 'rgba(239,68,68,0.9)', text: '#450a0a', dot: '#ef4444', label: 'Não compareceu' },
  remarcada: { bg: 'rgba(148,163,184,0.85)', text: '#0f172a', dot: '#94a3b8', label: 'Remarcada' },
  cancelada: { bg: 'rgba(100,116,139,0.7)', text: '#0f172a', dot: '#64748b', label: 'Cancelada' },
}

export function eventTopPx(date: Date) {
  const hours = date.getHours() + date.getMinutes() / 60
  return Math.max(0, (hours - START_HOUR) * HOUR_HEIGHT)
}

export const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
