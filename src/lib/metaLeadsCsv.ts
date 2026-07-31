import type { LeadStage } from '@/types/domain'

/** Tipos de abordagem usados como rótulo na Central de Leads. */
export const APPROACH_TYPES = [
  'boas vindas',
  'curtida',
  'story',
  'chamou',
  'reativação',
  'comentário',
] as const

/** Estágio da Meta → etapa do nosso kanban. Cobre os estágios espelhados e os padrão. */
const STAGE_MAP: Record<string, LeadStage> = {
  // espelhados do nosso kanban
  'ativações': 'novo_lead',
  'ativacoes': 'novo_lead',
  'conversas em condução': 'em_qualificacao',
  'conversas em conducao': 'em_qualificacao',
  'oferta de reunião': 'oferta_reuniao',
  'ofertas de reunião': 'oferta_reuniao',
  'oferta de reuniao': 'oferta_reuniao',
  'ofertas de reuniao': 'oferta_reuniao',
  'follow-up': 'follow_up_prevenda',
  'follow up': 'follow_up_prevenda',
  agendamento: 'agendado',
  'no-show': 'reuniao_nao_realizada',
  'no show': 'reuniao_nao_realizada',
  // padrão da Meta (fallback, caso ainda não tenham criado os personalizados)
  'em análise': 'novo_lead',
  'em analise': 'novo_lead',
  'em andamento': 'em_qualificacao',
  convertido: 'oferta_reuniao',
}

export interface ParsedMetaLead {
  name: string
  createdAt: string | null
  stage: LeadStage
  stageRaw: string
  instagram: string | null
  ownerName: string | null
  approachType: string | null
  labels: string[]
  metaKey: string
}

/** Divide uma linha de CSV respeitando aspas (nomes têm vírgula: "Filipe Souza, B.Sc"). */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else inQuotes = !inQuotes
    } else if (c === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out.map((v) => v.trim())
}

/** "07/29/2026 3:41pm" (MM/DD/YYYY) → ISO. */
function parseMetaDate(v: string): string | null {
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})(am|pm)$/i)
  if (!m) return null
  const [, mm, dd, yyyy, hhRaw, min, ampm] = m
  let hh = Number(hhRaw) % 12
  if (ampm.toLowerCase() === 'pm') hh += 12
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), hh, Number(min))
  return isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Lê o CSV exportado da Central de Leads da Meta.
 * `sellerNames` é a lista de nomes das social sellers cadastradas — usada para
 * identificar a dona pelo rótulo quando "Proprietário" vem como Unassigned.
 */
export function parseMetaLeadsCsv(text: string, sellerNames: string[] = []): ParsedMetaLead[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase())
  const col = (name: string) => header.findIndex((h) => h.includes(name))
  const iCreated = col('criado')
  const iName = col('nome')
  const iStage = col('estágio') >= 0 ? col('estágio') : col('estagio')
  const iOwner = col('propriet')
  const iLabels = col('rótulo') >= 0 ? col('rótulo') : col('rotulo')
  // A Central de Leads pode exportar o @ em colunas com nomes variados.
  const iInsta = [
    'instagram', 'usuário do instagram', 'usuario do instagram', 'username', 'usuário', 'usuario', '@',
  ].map(col).find((i) => i >= 0) ?? -1

  const sellersLower = sellerNames.map((n) => ({ raw: n, low: n.toLowerCase() }))
  const out: ParsedMetaLead[] = []
  const seen = new Set<string>()

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line)
    const name = (iName >= 0 ? cells[iName] : '')?.trim()
    if (!name) continue

    const createdRaw = iCreated >= 0 ? cells[iCreated] ?? '' : ''
    const createdAt = parseMetaDate(createdRaw)
    const stageRaw = (iStage >= 0 ? cells[iStage] ?? '' : '').trim()
    const stage = STAGE_MAP[stageRaw.toLowerCase()] ?? 'novo_lead'

    const labels = (iLabels >= 0 ? cells[iLabels] ?? '' : '')
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean)

    // Tipo de abordagem: primeiro rótulo que bate com a lista conhecida.
    const approachType =
      labels.find((l) => APPROACH_TYPES.includes(l.toLowerCase() as (typeof APPROACH_TYPES)[number]))
        ?.toLowerCase() ?? null

    // Dona: coluna Proprietário; se Unassigned, casa um rótulo com os nomes cadastrados.
    const ownerRaw = (iOwner >= 0 ? cells[iOwner] ?? '' : '').trim()
    let ownerName: string | null =
      ownerRaw && ownerRaw.toLowerCase() !== 'unassigned' ? ownerRaw : null
    if (!ownerName) {
      for (const label of labels) {
        const hit = sellersLower.find(
          (s) => s.low === label.toLowerCase() || s.low.split(' ')[0] === label.toLowerCase(),
        )
        if (hit) {
          ownerName = hit.raw
          break
        }
      }
    }

    // @ do Instagram — é ele que identifica a pessoa (nome de exibição repete).
    const instaRaw = (iInsta >= 0 ? cells[iInsta] ?? '' : '').trim()
    const instagram = instaRaw ? `@${instaRaw.replace(/^@+/, '').toLowerCase()}` : null

    // Dedupe: mesmo lead reimportado tem sempre o mesmo nome + data de criação.
    const metaKey = `${name}|${createdRaw}`.slice(0, 300)
    if (seen.has(metaKey)) continue
    seen.add(metaKey)

    out.push({ name, createdAt, stage, stageRaw, instagram, ownerName, approachType, labels, metaKey })
  }

  return out
}
