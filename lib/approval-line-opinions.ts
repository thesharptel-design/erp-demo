import { getApprovalRoleLabel } from '@/lib/approval-roles'

export type ApprovalOpinionRowVm = {
  id: number
  lineNo: number
  roleLabel: string
  name: string
  statusLabel: string
  body: string
  actedAt: string | null
}

function lineStatusLabel(status: string) {
  const x = String(status || '').toLowerCase()
  if (x === 'approved') return '승인'
  if (x === 'rejected') return '반려'
  if (x === 'pending') return '진행중'
  if (x === 'waiting') return '대기'
  if (x === 'cancelled') return '취소'
  return status || '—'
}

/** `approval_lines` 중 의견(opinion)이 있는 행만, 결재·협조 상세 용지·표시용 */
export function selectApprovalOpinionRows(
  lines: Array<{
    id: number
    line_no: number
    approver_id: string
    approver_role: string
    status: string
    opinion: string | null
    acted_at?: string | null
  }>,
  userNameById: Map<string, string | null | undefined>
): ApprovalOpinionRowVm[] {
  return [...lines]
    .filter((l) => String(l.opinion ?? '').trim())
    .sort((a, b) => a.line_no - b.line_no)
    .map((l) => ({
      id: l.id,
      lineNo: l.line_no,
      roleLabel: getApprovalRoleLabel(l.approver_role),
      name: (userNameById.get(l.approver_id) ?? '').trim() || '—',
      statusLabel: lineStatusLabel(l.status),
      body: String(l.opinion).trim(),
      actedAt: l.acted_at ?? null,
    }))
}
