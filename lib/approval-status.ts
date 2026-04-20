import type { Database } from '@/lib/database.types'
import { getApprovalRoleLabel, normalizeApprovalRole } from '@/lib/approval-roles'

export type ApprovalDocLike = Pick<
  Database['public']['Tables']['approval_docs']['Row'],
  'status' | 'remarks' | 'current_line_no' | 'doc_type'
> & {
  /** Present on full 결재 문서 로드; 목록·대시보드에서는 누락될 수 있음 */
  content?: string | null
  outbound_requests?:
    | { id: number }[]
    | { id: number }
    | null
}

export type ApprovalLineLike = Pick<
  Database['public']['Tables']['approval_lines']['Row'],
  'id' | 'line_no' | 'status' | 'approver_role' | 'approver_id'
>

export type OutboundRequestStatus = Database['public']['Tables']['outbound_requests']['Row']['status']

export function getWriterName(appUsers: { user_name?: string } | { user_name?: string }[] | null | undefined) {
  if (!appUsers) return '-'
  if (Array.isArray(appUsers)) return appUsers[0]?.user_name ?? '-'
  return appUsers.user_name ?? '-'
}

export function getDeptName(departments: { dept_name?: string } | { dept_name?: string }[] | null | undefined) {
  if (!departments) return '-'
  if (Array.isArray(departments)) return departments[0]?.dept_name ?? '-'
  return departments.dept_name ?? '-'
}

export function getDocTypeLabel(docType: string | null | undefined) {
  switch (docType ?? '') {
    case 'draft_doc':
      return '일반기안'
    case 'purchase_request':
      return '구매품의'
    case 'outbound_request':
      return '출고요청'
    case 'leave_request':
      return '휴가신청'
    default:
      return docType ?? ''
  }
}

/** 통합 결재함 / 대시보드: 행 링크 목적지 */
export function getDocDetailHref(doc: ApprovalDocLike & { id: number }) {
  if (doc.doc_type === 'outbound_request' && doc.outbound_requests) {
    const rows = Array.isArray(doc.outbound_requests) ? doc.outbound_requests : [doc.outbound_requests]
    const rid = rows[0]?.id
    if (rid != null) return `/outbound-requests/${rid}`
  }
  return `/approvals/${doc.id}`
}

const badge = (classes: string) =>
  `inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black border ${classes}`

/** 통합 결재문서함 테이블용 상태 텍스트 (필터·정렬·접근성) */
export function getApprovalDocDetailedStatusLabel(doc: ApprovalDocLike): string {
  const remarks = doc.remarks || ''
  if (remarks.includes('취소 요청 중')) return '기안자 취소요청'
  if (remarks.includes('취소완료') && !remarks.includes('재고환원')) return remarks
  if (remarks.includes('취소승인')) return remarks
  if (remarks.includes('재고환원') || remarks.includes('결재 중 취소됨')) return '취소 완료됨'
  switch (doc.status) {
    case 'draft':
      return '임시저장'
    case 'rejected':
      return '반려됨'
    case 'approved':
      return '최종 승인'
    case 'submitted':
    case 'in_review':
      if (doc.current_line_no === 2) return '검토자 대기중'
      if ((doc.current_line_no ?? 0) >= 3) return '결재 대기중'
      return '결재 진행중'
    default:
      return String(doc.status ?? '')
  }
}

/** 통합 결재문서함 테이블용 뱃지 클래스 + 라벨 */
export function getApprovalDocDetailedStatusPresentation(doc: ApprovalDocLike): { label: string; className: string } {
  const remarks = doc.remarks || ''
  if (remarks.includes('취소 요청 중')) {
    return {
      label: '기안자 취소요청',
      className: badge('bg-red-100 text-red-600 animate-pulse border-red-200'),
    }
  }
  if (remarks.includes('취소완료') && !remarks.includes('재고환원')) {
    return {
      label: remarks,
      className: badge('bg-orange-100 text-orange-600 animate-pulse border-orange-200'),
    }
  }
  if (remarks.includes('취소승인')) {
    return {
      label: remarks,
      className: badge('bg-orange-50 text-orange-500 border-orange-200'),
    }
  }
  if (remarks.includes('재고환원') || remarks.includes('결재 중 취소됨')) {
    return {
      label: '취소 완료됨',
      className: badge('bg-gray-200 text-gray-500 font-bold border-gray-300'),
    }
  }

  switch (doc.status) {
    case 'draft':
      return {
        label: '임시저장',
        className: badge('bg-gray-100 text-gray-500 font-bold border-gray-200'),
      }
    case 'rejected':
      return {
        label: '반려됨',
        className: badge('bg-red-50 text-red-600 border-red-200'),
      }
    case 'approved':
      return {
        label: '최종 승인',
        className: badge('bg-green-100 text-green-700 border-green-200'),
      }
    case 'submitted':
    case 'in_review':
      if (doc.current_line_no === 2) {
        return {
          label: '협조/검토 대기중',
          className: badge('bg-blue-100 text-blue-600 border-blue-200 font-bold'),
        }
      }
      if ((doc.current_line_no ?? 0) >= 3) {
        return {
          label: '결재 대기중',
          className: badge('bg-indigo-100 text-indigo-700 border-indigo-200'),
        }
      }
      return {
        label: '결재 진행중',
        className: badge('bg-blue-50 text-blue-500 border-blue-100 font-bold'),
      }
    default:
      return {
        label: String(doc.status ?? ''),
        className: badge('bg-gray-100 text-gray-600 font-bold'),
      }
  }
}

/**
 * 출고요청 목록 화면: 요청 행(`outbound_requests`) + 결재 헤더/라인 기준 상태.
 * 통합함과 동일한 취소/결재 용어를 쓰되, 출고 실행 완료(`completed`)는 별도 표기.
 */
export function getOutboundRequestRowPresentation(input: {
  approvalDoc: ApprovalDocLike | null | undefined
  lines: ApprovalLineLike[]
  reqStatus: OutboundRequestStatus
}): { label: string; className: string } {
  const { approvalDoc: doc, lines, reqStatus } = input
  const sorted = [...lines].sort((a, b) => a.line_no - b.line_no)

  if (!doc) {
    if (reqStatus === 'draft') return { label: '작성중', className: badge('bg-gray-100 text-gray-600 font-bold border-gray-200') }
    if (reqStatus === 'cancelled') {
      return { label: '취소 완료', className: badge('bg-gray-200 text-gray-500 font-bold line-through border-gray-300') }
    }
    return { label: String(reqStatus), className: badge('bg-gray-100 text-gray-700') }
  }

  const remarks = doc.remarks || ''

  if (remarks.includes('취소 요청 중')) {
    return { label: '기안자 취소요청', className: badge('bg-red-100 text-red-600 animate-pulse border-red-200') }
  }
  if (remarks.includes('취소완료') && !remarks.includes('재고환원')) {
    return { label: '취소 릴레이 진행', className: badge('bg-orange-100 text-orange-700 font-bold border-orange-200') }
  }
  if (remarks.includes('취소승인') && !remarks.includes('재고환원')) {
    return { label: '기안자 재고환원 대기', className: badge('bg-orange-50 text-orange-600 border-orange-200') }
  }
  if (remarks.includes('재고환원') || (doc.status === 'rejected' && remarks.includes('재고환원'))) {
    return { label: '취소 완료됨', className: badge('bg-gray-200 text-gray-500 font-bold line-through border-gray-300') }
  }
  if (doc.status === 'rejected') {
    return { label: '반려됨', className: badge('bg-red-50 text-red-600 font-bold border-red-100') }
  }

  if (doc.status === 'in_review' || doc.status === 'submitted') {
    const pendingLine = sorted.find((l) => l.status === 'pending')
    if (pendingLine) {
      const roleLabel = getApprovalRoleLabel(pendingLine.approver_role)
      return {
        label: `${roleLabel} 대기중`,
        className: badge('bg-blue-100 text-blue-700 font-bold border-blue-200 shadow-sm'),
      }
    }
    const approvedLines = sorted.filter((l) => l.status === 'approved')
    if (approvedLines.length > 0) {
      const lastApproved = approvedLines[approvedLines.length - 1]
      const roleLabel = getApprovalRoleLabel(lastApproved.approver_role)
      return {
        label: `${roleLabel} 승인 완료`,
        className: badge('bg-blue-100 text-blue-700 font-bold border-blue-200 shadow-sm'),
      }
    }
    return { label: '결재 진행중', className: badge('bg-yellow-100 text-yellow-700 font-bold border-yellow-200') }
  }

  if (reqStatus === 'completed') {
    return { label: '출고 완료', className: badge('bg-purple-100 text-purple-700 font-black border-purple-200 shadow-sm') }
  }
  if (reqStatus === 'cancelled') {
    return { label: '취소 완료', className: badge('bg-gray-200 text-gray-500 font-bold line-through border-gray-300') }
  }
  if (doc.status === 'approved') {
    return { label: '최종 승인', className: badge('bg-green-100 text-green-700 font-black border-green-200 shadow-sm') }
  }
  if (doc.status === 'draft') {
    return { label: '임시저장', className: badge('bg-gray-100 text-gray-600 font-bold border-gray-200') }
  }

  return { label: String(reqStatus), className: badge('bg-gray-100 text-gray-700') }
}

/** 결재 취소 릴레이 UI (`ApprovalActionButtons`)와 동일한 문자열 기준 */
export function isApprovalCancellationRemarkProcess(remarks: string | null | undefined) {
  const r = remarks || ''
  return r.includes('취소 요청') || r.includes('취소완료') || r.includes('취소승인')
}

export function getPendingApprovalLine(lines: ApprovalLineLike[]) {
  const sorted = [...lines].sort((a, b) => a.line_no - b.line_no)
  return sorted.find((line) => {
    const role = normalizeApprovalRole(line.approver_role)
    if (!role) return false
    return line.status === 'pending'
  })
}
