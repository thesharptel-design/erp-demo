import type { ApprovalRole } from '@/lib/approval-roles'
import { normalizeApprovalRole, getApprovalRoleOrder, isApprovalActionRole } from '@/lib/approval-roles'

export type ParticipantInput = {
  userId: string
  role: ApprovalRole
}

export type ApprovalLineInsert = {
  approval_doc_id: number
  line_no: number
  approver_id: string
  approver_role: string
  status: 'pending' | 'waiting'
}

export function normalizeParticipants(raw: Array<{ userId: string; role: string }>) {
  const dedup = new Set<string>()
  const normalized: Array<ParticipantInput & { _inputOrder: number }> = []

  for (let idx = 0; idx < raw.length; idx += 1) {
    const row = raw[idx]
    const userId = String(row.userId ?? '').trim()
    const role = normalizeApprovalRole(row.role)
    if (!userId || !role) continue
    const key = `${userId}-${role}`
    if (dedup.has(key)) continue
    dedup.add(key)
    normalized.push({ userId, role, _inputOrder: idx })
  }

  normalized.sort((a, b) => {
    const byRole = getApprovalRoleOrder(a.role) - getApprovalRoleOrder(b.role)
    if (byRole !== 0) return byRole
    return a._inputOrder - b._inputOrder
  })
  return normalized.map((entry) => ({ userId: entry.userId, role: entry.role }))
}

export function buildApprovalLines(docId: number, participants: ParticipantInput[]): ApprovalLineInsert[] {
  const actionable = participants.filter((p) => isApprovalActionRole(p.role))
  return actionable.map((p, index) => ({
    approval_doc_id: docId,
    line_no: index + 1,
    approver_id: p.userId,
    approver_role: p.role,
    status: index === 0 ? 'pending' : 'waiting',
  }))
}

export function buildApprovalParticipantsRows(docId: number, participants: ParticipantInput[]) {
  return participants.map((p, index) => ({
    approval_doc_id: docId,
    user_id: p.userId,
    role: p.role,
    line_no: index + 1,
  }))
}
