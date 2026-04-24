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

/**
 * `approval_lines` 중 `opinion`이 공백만이 아닌 행만 반환합니다 (빈 승인 의견은 제외).
 * 상세 페이지는 `approval_lines`를 `select('*')`로 불러온 뒤 이 함수에 넘기면 저장 값과 일치합니다.
 */
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
