import type { ReactNode } from 'react'

export function getDocStatusLabel(status: string) {
  switch (status) {
    case 'draft':
      return '임시저장'
    case 'submitted':
      return '상신 완료'
    case 'in_review':
      return '검토/결재 중'
    case 'approved':
      return '결재완료'
    case 'rejected':
      return '반려/취소'
    default:
      return status
  }
}

export function getActionLabel(actionType: string) {
  switch (actionType) {
    case 'submit':
      return '상신'
    case 'approve':
      return '승인'
    case 'reject':
      return '반려'
    case 'approve_revoke':
      return '승인 철회'
    case 'recall':
      return '회수'
    case 'cancel':
      return '취소'
    case 'cancel_request':
      return '취소 요청'
    case 'cancel_relay':
      return '역순 취소 처리'
    case 'direct_cancel_final':
      return '결재 취소(완결 후)'
    case 'outbound_cancel_done':
      return '취소·재고환원 완료'
    default:
      return actionType
  }
}

export function getIsAdmin(users: { id: string; role_name?: string | null }[], currentUserId: string | null) {
  if (!currentUserId) return false
  const currentUserProfile = users.find((u) => u.id === currentUserId)
  return String(currentUserProfile?.role_name || '').toLowerCase() === 'admin'
}

export function canViewApprovalDoc(params: {
  isAdmin: boolean
  currentUserId: string | null
  writerId: string
  lines: { approver_id: string }[]
  participants: { user_id: string }[]
}) {
  const { isAdmin, currentUserId, writerId, lines, participants } = params
  if (isAdmin) return true
  if (!currentUserId) return false
  if (writerId === currentUserId) return true
  if (lines.some((l) => l.approver_id === currentUserId)) return true
  if (participants.some((p) => p.user_id === currentUserId)) return true
  return false
}

export function getDetailLineStatus(role: string, status: string): ReactNode {
  if (role === 'drafter') return <span className="font-bold text-gray-600">기안완료</span>
  if (status === 'pending') return <span className="font-black text-blue-600">대기중</span>
  if (status === 'approved') return <span className="font-black text-green-600">승인</span>
  if (status === 'rejected') return <span className="font-black text-red-600">반려</span>
  return <span className="font-bold text-gray-400">대기</span>
}

export function getDocStatusBadgeClass(status: string) {
  switch (status) {
    case 'approved':
      return 'bg-emerald-100 text-emerald-900'
    case 'rejected':
      return 'bg-red-50 text-red-800'
    case 'draft':
      return 'bg-gray-100 text-gray-800'
    default:
      return 'bg-blue-50 text-blue-900'
  }
}

export function cooperatorReadBadge(status: string): ReactNode {
  if (status === 'approved') {
    return <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-black text-green-800">읽음</span>
  }
  if (status === 'rejected') {
    return <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-black text-red-800">반려</span>
  }
  return <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-800">안읽음</span>
}
