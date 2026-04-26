import type { ApprovalRole } from '@/lib/approval-roles'
import { normalizeApprovalRole, isApprovalActionRole } from '@/lib/approval-roles'

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
  const normalized: ParticipantInput[] = []

  for (let idx = 0; idx < raw.length; idx += 1) {
    const row = raw[idx]
    const userId = String(row.userId ?? '').trim()
    const role = normalizeApprovalRole(row.role)
    if (!userId || !role) continue
    const key = `${userId}-${role}`
    if (dedup.has(key)) continue
    dedup.add(key)
    normalized.push({ userId, role })
  }

  return normalized
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

/** `fanout_work_approval_notification(..., pending_lines)` 가 실제로 user_notifications 를 넣는지와 동일 조건 */
export function hasWorkApprovalInboxRecipientPending(lines: ApprovalLineInsert[], actorId: string): boolean {
  return lines.some(
    (l) =>
      l.status === 'pending' &&
      isApprovalActionRole(l.approver_role) &&
      l.approver_id !== actorId
  )
}

export function buildApprovalParticipantsRows(docId: number, participants: ParticipantInput[]) {
  return participants.map((p, index) => ({
    approval_doc_id: docId,
    user_id: p.userId,
    role: p.role,
    line_no: index + 1,
  }))
}
