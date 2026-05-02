import type { ReactNode } from 'react'

import { isSystemAdminUser, type CurrentUserPermissions } from '@/lib/permissions'

export function getDocStatusLabel(status: string) {
  switch (status) {
    case 'draft':
      return '임시저장'
    case 'submitted':
      return '상신 완료'
    case 'in_review':
      return '검토/결재 중'
    case 'in_progress':
      return '진행중'
    case 'approved':
      return '결재완료'
    case 'effective':
      return '효력발생'
    case 'closed':
      return '최종종결'
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
    case 'reject_direct':
      return '직권반려'
    case 'reject_sequential':
      return '순차반려'
    case 'reject_targeted':
      return '선택반려'
    case 'recall_before_first_action':
      return '기안회수'
    case 'cancel_requested_by_writer':
      return '기안자 취소요청'
    case 'confirm_pre_cooperation':
      return '협조확인'
    case 'override_approve':
      return '전결승인'
    case 'skip_by_override':
      return '전결생략'
    case 'confirm_post_cooperation':
      return '사후확인'
    case 'close':
      return '최종종결'
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
    case 'outbound_assign_handler':
      return '출고 담당자 지정'
    case 'outbound_reassign_handler':
      return '출고 담당자 변경'
    case 'outbound_recall_handler':
      return '출고 담당자 회수'
    case 'outbound_execute_self':
      return '출고 시작'
    case 'outbound_complete':
      return '출고 처리 완료'
    default:
      return actionType
  }
}

export function getIsAdmin(
  users: (Pick<CurrentUserPermissions, 'id'> &
    Partial<Pick<CurrentUserPermissions, 'role_name' | 'can_manage_permissions' | 'can_admin_manage'>>)[],
  currentUserId: string | null
) {
  if (!currentUserId) return false
  const key = String(currentUserId).trim().toLowerCase()
  const currentUserProfile = users.find((u) => String(u.id).trim().toLowerCase() === key)
  if (!currentUserProfile) return false
  return isSystemAdminUser(
    currentUserProfile as Pick<CurrentUserPermissions, 'role_name' | 'can_manage_permissions' | 'can_admin_manage'>
  )
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
  if (status === 'confirmed') return <span className="font-black text-emerald-600">확인</span>
  if (status === 'approved') return <span className="font-black text-green-600">승인</span>
  if (status === 'skipped') return <span className="font-black text-amber-600">전결생략</span>
  if (status === 'rejected') return <span className="font-black text-red-600">반려</span>
  return <span className="font-bold text-gray-400">대기</span>
}

export function getDocStatusBadgeClass(status: string) {
  switch (status) {
    case 'approved':
    case 'effective':
    case 'closed':
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
  if (status === 'approved' || status === 'confirmed') {
    return <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-black text-green-800">확인</span>
  }
  if (status === 'rejected') {
    return <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-black text-red-800">반려</span>
  }
  return <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-800">안읽음</span>
}
