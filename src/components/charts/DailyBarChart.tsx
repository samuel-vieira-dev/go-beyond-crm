import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format, parseISO } from 'date-fns'

interface Point {
  date: string
  value: number
}

function CustomTooltip({
  active,
  payload,
  formatValue,
}: {
  active?: boolean
  payload?: { payload: Point }[]
  formatValue: (n: number) => string
}) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="card-surface rounded-lg bg-navy-900/95 px-3 py-2 text-xs shadow-lg">
      <p className="text-white/50">{format(parseISO(point.date), 'd/MM')}</p>
      <p className="font-semibold text-white">{formatValue(point.value)}</p>
    </div>
  )
}

export function DailyBarChart({
  data,
  formatValue = (n) => String(n),
  height = 220,
}: {
  data: Point[]
  formatValue?: (n: number) => string
  height?: number
}) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-xs text-white/30">Sem dados no período.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
        <XAxis
          dataKey="date"
          tickFormatter={(d) => format(parseISO(d), 'd/MM')}
          tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
        <Tooltip content={<CustomTooltip formatValue={formatValue} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Bar dataKey="value" fill="var(--color-gold-500)" radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  )
}
