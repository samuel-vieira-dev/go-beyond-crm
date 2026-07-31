import { useState, type ReactNode } from 'react'
import { endOfDay, endOfWeek, parseISO, startOfDay, startOfWeek } from 'date-fns'
import { Input, Label, Select } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import { ORIGIN_LABELS, type LeadOrigin } from '@/types/domain'
import type { LeadFilters } from '@/hooks/useLeads'

type DatePreset = 'all' | 'today' | 'week' | 'custom'

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'all', label: 'Todo período' },
  { key: 'today', label: 'Hoje' },
  { key: 'week', label: 'Esta semana' },
  { key: 'custom', label: 'Personalizado' },
]

export function LeadFiltersBar({
  filters,
  onChange,
  originOptions,
  extraFilters,
  hideQualification,
}: {
  filters: LeadFilters
  onChange: (filters: LeadFilters) => void
  originOptions?: LeadOrigin[]
  extraFilters?: ReactNode
  hideQualification?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [datePreset, setDatePreset] = useState<DatePreset>('all')

  const activeCount =
    (filters.origin ? 1 : 0) +
    (filters.formTag ? 1 : 0) +
    (filters.isMql !== undefined && !hideQualification ? 1 : 0) +
    (filters.dateFrom || filters.dateTo ? 1 : 0)

  function applyPreset(preset: DatePreset) {
    setDatePreset(preset)
    const now = new Date()
    if (preset === 'all') {
      onChange({ ...filters, dateFrom: undefined, dateTo: undefined })
    } else if (preset === 'today') {
      onChange({ ...filters, dateFrom: startOfDay(now).toISOString(), dateTo: endOfDay(now).toISOString() })
    } else if (preset === 'week') {
      onChange({
        ...filters,
        dateFrom: startOfWeek(now, { weekStartsOn: 0 }).toISOString(),
        dateTo: endOfWeek(now, { weekStartsOn: 0 }).toISOString(),
      })
    }
    // 'custom' mantém o que estiver e mostra os inputs
  }

  function clearAll() {
    setDatePreset('all')
    onChange({ ...filters, search: '', origin: undefined, formTag: undefined, isMql: undefined, dateFrom: undefined, dateTo: undefined })
  }

  return (
    <div className="card-surface rounded-xl p-3">
      {/* Linha sempre visível: busca + botão de filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-48 flex-1">
          <Input
            placeholder="🔍  Buscar por nome, WhatsApp, email ou @instagram..."
            value={filters.search ?? ''}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
          />
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
            open || activeCount > 0
              ? 'border-gold-500/40 bg-gold-500/10 text-gold-300'
              : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10',
          )}
        >
          <span>⚙︎ Filtros</span>
          {activeCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-500 px-1 text-[11px] font-semibold text-navy-950">
              {activeCount}
            </span>
          )}
          <span className={cn('transition-transform', open && 'rotate-180')}>▾</span>
        </button>
        {activeCount > 0 && (
          <button onClick={clearAll} className="rounded-lg px-3 py-2 text-sm text-white/50 hover:text-white">
            Limpar
          </button>
        )}
      </div>

      {/* Painel expandido */}
      {open && (
        <div className="mt-4 grid grid-cols-1 gap-4 border-t border-white/10 pt-4 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label>Formulário</Label>
            <Select
              value={filters.formTag ?? ''}
              onChange={(e) => onChange({ ...filters, formTag: e.target.value || undefined })}
            >
              <option value="">Todos os formulários</option>
              <option value="Formulário - Alunos">Formulário - Alunos</option>
              <option value="Tráfego">Tráfego</option>
              <option value="Organico">Organico</option>
            </Select>
          </div>

          <div>
            <Label>Origem do lead</Label>
            <Select
              value={filters.origin ?? ''}
              onChange={(e) =>
                onChange({ ...filters, origin: (e.target.value || undefined) as LeadOrigin | undefined })
              }
            >
              <option value="">Todas as origens</option>
              {(originOptions ?? (Object.keys(ORIGIN_LABELS) as LeadOrigin[])).map((o) => (
                <option key={o} value={o}>
                  {ORIGIN_LABELS[o]}
                </option>
              ))}
            </Select>
          </div>

          {!hideQualification && (
            <div>
              <Label>Qualificação do lead</Label>
              <Select
                value={filters.isMql === undefined ? '' : String(filters.isMql)}
                onChange={(e) =>
                  onChange({ ...filters, isMql: e.target.value === '' ? undefined : e.target.value === 'true' })
                }
              >
                <option value="">Todos os leads</option>
                <option value="true">Somente qualificados</option>
                <option value="false">Somente não qualificados</option>
              </Select>
            </div>
          )}

          <div>
            <Label>Período de cadastro</Label>
            <div className="flex flex-wrap gap-1">
              {DATE_PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => applyPreset(p.key)}
                  className={cn(
                    'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                    datePreset === p.key
                      ? 'bg-gold-500 text-navy-950'
                      : 'bg-white/5 text-white/60 hover:bg-white/10',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {datePreset === 'custom' && (
              <div className="mt-2 flex items-center gap-2">
                <Input
                  type="date"
                  value={filters.dateFrom?.slice(0, 10) ?? ''}
                  onChange={(e) =>
                    onChange({
                      ...filters,
                      dateFrom: e.target.value ? startOfDay(parseISO(e.target.value)).toISOString() : undefined,
                    })
                  }
                />
                <span className="text-white/30">até</span>
                <Input
                  type="date"
                  value={filters.dateTo?.slice(0, 10) ?? ''}
                  onChange={(e) =>
                    onChange({
                      ...filters,
                      dateTo: e.target.value ? endOfDay(parseISO(e.target.value)).toISOString() : undefined,
                    })
                  }
                />
              </div>
            )}
          </div>

          {extraFilters}
        </div>
      )}
    </div>
  )
}
