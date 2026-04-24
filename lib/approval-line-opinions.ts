import { getApprovalRoleLabel, isApprovalActionRole } from '@/lib/approval-roles'

/** 본문 아래 결재·협조 의견란: 미입력 시 표시 */
export const APPROVAL_OPINION_EMPTY_DISPLAY = '[-]'

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

function isProcessedApprovalLine(l: { status: string; acted_at?: string | null }): boolean {
  const st = String(l.status || '').toLowerCase()
  if (st === 'approved' || st === 'rejected' || st === 'cancelled') return true
  const at = l.acted_at
  return at != null && String(at).trim() !== ''
}

/**
 * 결재·협조·참조 등 액션 라인 중 **이미 처리된** 행을 반환합니다.
 * 의견이 비어 있어도 처리일시가 있으면 한 줄로 넣고 `body`는 `[-]`로 둡니다.
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
    .filter((l) => isApprovalActionRole(l.approver_role) && isProcessedApprovalLine(l))
    .sort((a, b) => {
      const ta = a.acted_at ?? ''
      const tb = b.acted_at ?? ''
      if (ta && tb && ta !== tb) return ta.localeCompare(tb)
      return a.line_no - b.line_no
    })
    .map((l) => {
      const rawOp = String(l.opinion ?? '').trim()
      return {
        id: l.id,
        lineNo: l.line_no,
        roleLabel: getApprovalRoleLabel(l.approver_role),
        name: (userNameById.get(l.approver_id) ?? '').trim() || '—',
        statusLabel: lineStatusLabel(l.status),
        body: rawOp === '' ? APPROVAL_OPINION_EMPTY_DISPLAY : rawOp,
        actedAt: l.acted_at ?? null,
      }
    })
}
