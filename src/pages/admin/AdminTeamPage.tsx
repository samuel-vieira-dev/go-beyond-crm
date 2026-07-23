import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { FormRow, Input, Select } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { useAllProfiles } from '@/hooks/useProfiles'
import { useCreateTeamMember, useUpdateTeamMember } from '@/hooks/useTeam'
import { ROLE_LABELS, type Role } from '@/types/domain'

export function AdminTeamPage() {
  const { data: profiles, isLoading } = useAllProfiles()
  const updateMember = useUpdateTeamMember()
  const [formOpen, setFormOpen] = useState(false)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Equipe</h1>
          <p className="text-sm text-white/40">Contas de acesso e papéis da plataforma</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>+ Adicionar pessoa</Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-white/40">Carregando equipe...</p>
      ) : (
        <div className="card-surface overflow-hidden rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-white/40 uppercase">
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Papel</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {profiles?.map((p) => (
                <tr key={p.id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 text-white">{p.full_name}</td>
                  <td className="px-4 py-3">
                    <Select
                      className="w-auto"
                      value={p.role}
                      onChange={(e) => updateMember.mutate({ id: p.id, role: e.target.value as Role })}
                    >
                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => updateMember.mutate({ id: p.id, active: !p.active })}>
                      <Badge tone={p.active ? 'green' : 'neutral'}>{p.active ? 'Ativo' : 'Inativo'}</Badge>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateMemberModal open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  )
}

function CreateMemberModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createMember = useCreateTeamMember()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('sdr')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await createMember.mutateAsync({ full_name: fullName, email, password, role })
      setFullName('')
      setEmail('')
      setPassword('')
      setRole('sdr')
      onClose()
    } catch {
      setError('Não foi possível criar a conta. Verifique o email e tente novamente.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Adicionar pessoa à equipe" width="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormRow label="Nome completo *">
          <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </FormRow>
        <FormRow label="Email *">
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormRow>
        <FormRow label="Senha inicial *">
          <Input
            type="text"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Compartilhe com a pessoa por um canal seguro"
          />
        </FormRow>
        <FormRow label="Papel *">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormRow>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={createMember.isPending}>
            {createMember.isPending ? 'Criando...' : 'Criar conta'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
