import type { Database } from '@/lib/database.types'
import {
  getApprovalRoleLabel,
  isApprovalActionRole,
  isFinalApprovalRole,
  normalizeApprovalRole,
} from '@/lib/approval-roles'

export type ApprovalDocLike = Pick<
  Database['public']['Tables']['approval_docs']['Row'],
  'status' | 'remarks' | 'current_line_no' | 'doc_type'
> & {
  /** Present on full 결재 문서 로드; 목록·대시보드에서는 누락될 수 있음 */
  content?: string | null
  /** `direct_cancel_final_approval` 이후 상세·용지에서만 채워질 수 있음 */
  post_approval_cancel_opinion?: string | null
  post_approval_cancel_by?: string | null
  post_approval_cancel_at?: string | null
  outbound_requests?:
    | { id: number }[]
    | { id: number }
    | null
}

export type ApprovalLineLike = Pick<
  Database['public']['Tables']['approval_lines']['Row'],
  'id' | 'line_no' | 'status' | 'approver_role' | 'approver_id'
> & {
  opinion?: string | null
}

export type OutboundRequestStatus = Database['public']['Tables']['outbound_requests']['Row']['status']
export type OutboundDispatchState = Database['public']['Tables']['outbound_requests']['Row']['dispatch_state']

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

/** 통합 결재문서함·상태 필터 콤보 (value는 DB `status` 또는 `remarks` 부분 문자열 검색에 사용) */
export const APPROVAL_INBOX_STATUS_FILTER_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'draft', label: '임시저장', keywords: ['임시'] },
  { value: '회수됨', label: '상신취소(기안회수)', keywords: ['회수', '상신취소'] },
  { value: 'submitted', label: '결재 진행중', keywords: ['진행', '상신'] },
  { value: 'in_review', label: '협조·결재 대기', keywords: ['검토', '대기', '협조'] },
  { value: 'approved', label: '최종 승인', keywords: ['승인'] },
  { value: 'rejected', label: '반려됨', keywords: ['반려'] },
  { value: '결재 취소', label: '결재취소', keywords: ['결재취소', '결재 취소'] },
  { value: '취소', label: '취소·환원(비고)', keywords: ['취소', '환원'] },
]

/** `ApprovalActionButtons` 회수 처리와 동일한 비고 문구 (RLS·삭제 조건과 일치해야 함) */
export const APPROVAL_RECALL_REMARK_MARKER = '기안 회수됨'

/** `direct_cancel_final_approval` RPC과 동일: 일반 반려(`결재자 반려`)와 구분 */
export const APPROVAL_POST_APPROVAL_CANCEL_REMARK = '결재 취소'

const LEGACY_POST_APPROVAL_CANCEL_OPINION_MARKER = '\n\n[결재 취소 의견]:'

export function isRejectedAsPostApprovalCancel(
  doc: Pick<ApprovalDocLike, 'status' | 'remarks'>
): boolean {
  return (
    doc.status === 'rejected' &&
    String(doc.remarks ?? '').trim() === APPROVAL_POST_APPROVAL_CANCEL_REMARK
  )
}

/** 구버전 RPC가 본문에 붙인 `[결재 취소 의견]:` 구간 제거·파싱 */
export function splitLegacyPostApprovalCancelFromContent(
  content: string | null | undefined
): { cleanBody: string; legacyOpinion: string | null } {
  const raw = content ?? ''
  const i = raw.indexOf(LEGACY_POST_APPROVAL_CANCEL_OPINION_MARKER)
  if (i === -1) return { cleanBody: raw, legacyOpinion: null }
  return {
    cleanBody: raw.slice(0, i).trimEnd(),
    legacyOpinion: raw.slice(i + LEGACY_POST_APPROVAL_CANCEL_OPINION_MARKER.length).trim() || null,
  }
}

/**
 * 용지 본문 표시용 본문 문자열 + 결재취소 요약 행(누가·언제·의견).
 * `remarks === 결재 취소` 인 경우에만 `row`를 채움.
 */
export function buildPostApprovalCancelPaperRow(
  doc: Pick<ApprovalDocLike, 'status' | 'remarks' | 'content'> & {
    post_approval_cancel_opinion?: string | null
    post_approval_cancel_by?: string | null
    post_approval_cancel_at?: string | null
  },
  cancelActorDisplayName: string | null
): { cleanBody: string; row: { actorName: string; opinion: string | null; at: string | null } | null } {
  if (!isRejectedAsPostApprovalCancel(doc)) {
    return { cleanBody: doc.content ?? '', row: null }
  }
  const { cleanBody, legacyOpinion } = splitLegacyPostApprovalCancelFromContent(doc.content ?? null)
  const opinion = (doc.post_approval_cancel_opinion ?? legacyOpinion)?.trim() || null
  const at = doc.post_approval_cancel_at ?? null
  const actorName = (cancelActorDisplayName ?? '').trim() || '—'
  return {
    cleanBody,
    row: { actorName, opinion, at },
  }
}

/** 기안자가 문서를 삭제할 수 있는 경우: 반려 종료, 또는 회수로 임시저장 복귀 */
export function canWriterDeleteApprovalDoc(doc: Pick<ApprovalDocLike, 'status' | 'remarks'>): boolean {
  if (doc.status === 'rejected') return true
  if (doc.status === 'draft' && (doc.remarks || '').includes(APPROVAL_RECALL_REMARK_MARKER)) return true
  return false
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

/**
 * 출고요청 결재 문서는 상세 UI가 `/outbound-requests/view/{outbound_requests.id}` 에만 구현되어 있다.
 * (통합함에 `outbound_requests` id가 없으면 기존처럼 결재 문서 view로 폴백)
 */
export function getOutboundRequestViewHrefFromApprovalDoc(doc: ApprovalDocLike & { id: number }): string | null {
  if (String(doc.doc_type ?? '') !== 'outbound_request') return null
  const raw = doc.outbound_requests
  if (!raw) return null
  const rid = Array.isArray(raw) ? raw[0]?.id : raw.id
  if (rid == null || !Number.isFinite(Number(rid))) return null
  return `/outbound-requests/view/${Number(rid)}`
}

/** 통합 결재함 / 대시보드: 행 링크 목적지 */
export function getDocDetailHref(doc: ApprovalDocLike & { id: number }) {
  const outboundHref = getOutboundRequestViewHrefFromApprovalDoc(doc)
  if (outboundHref) return outboundHref
  return `/approvals/${doc.id}`
}

/** 팝업(베어 셸) 상세: 사이드바 없이 동일 크기 창으로 연다. */
export function getDocDetailViewHref(doc: ApprovalDocLike & { id: number }) {
  const outboundHref = getOutboundRequestViewHrefFromApprovalDoc(doc)
  if (outboundHref) return outboundHref
  return `/approvals/view/${doc.id}`
}

type DocInboxOpen = ApprovalDocLike & { id: number; writer_id?: string | null }

/**
 * 통합함·대시보드: 기안자가 **회수·반려 등 수정 가능** 상태(`draft`/`rejected`)이면
 * 팝업에서 바로 편집 화면으로 연다. 그 외는 읽기 전용 view URL.
 */
export function getDocDetailOpenHref(doc: DocInboxOpen, currentUserId: string | null | undefined): string {
  const uid =
    currentUserId != null && String(currentUserId).trim() !== ''
      ? String(currentUserId).toLowerCase()
      : ''
  const wid = doc.writer_id != null ? String(doc.writer_id).toLowerCase() : ''
  if (uid && wid === uid && (doc.status === 'draft' || doc.status === 'rejected')) {
    if (doc.doc_type === 'outbound_request') return `/outbound-requests/new?resubmit=${doc.id}`
    return `/approvals/new?resubmit=${doc.id}`
  }
  return getDocDetailViewHref(doc)
}

const badge = (classes: string) =>
  `inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black border ${classes}`

export type ApprovalStatusBadge = { label: string; className: string }

/** 통합 결재문서함 테이블용 상태 텍스트 (필터·정렬·접근성) */
export type ApprovalWorkflowLineInput = { line_no: number; approver_role: string; status: string }

/**
 * 기안·출고 통합: [임시저장][결재,협조진행중][결재완료/협조대기][결재진행/협조완료][최종승인][반려]
 * (취소 릴레이 등 비고는 `getApprovalDocDetailedStatusPresentation` 쪽에서 별도 처리)
 */
export function getUnifiedApprovalWorkflowBadges(
  doc: ApprovalDocLike,
  lines: ApprovalWorkflowLineInput[] | null | undefined
): ApprovalStatusBadge[] {
  const L = [...(lines ?? [])].sort((a, b) => a.line_no - b.line_no)
  const one = (label: string, cls: string): ApprovalStatusBadge[] => [{ label, className: badge(cls) }]

  const remarks = doc.remarks || ''
  if (doc.status === 'draft' && remarks.includes(APPROVAL_RECALL_REMARK_MARKER)) {
    return one('상신취소·작성복귀', 'bg-amber-50 text-amber-900 border-amber-400 font-black')
  }
  if (doc.status === 'draft') return one('임시저장', 'bg-gray-100 text-gray-500 font-bold border-gray-200')
  if (doc.status === 'rejected') {
    if (isRejectedAsPostApprovalCancel(doc)) {
      return one('결재취소', 'bg-rose-50 text-rose-900 border-rose-400 font-black')
    }
    return one('반려', 'bg-red-50 text-red-700 border-red-300 font-black')
  }

  const hasCoop = L.some((l) => normalizeApprovalRole(l.approver_role) === 'cooperator')
  const allCoopDone = !L.some(
    (l) => normalizeApprovalRole(l.approver_role) === 'cooperator' && l.status !== 'approved'
  )

  const approverLines = L.filter((l) => normalizeApprovalRole(l.approver_role) === 'approver')
  const allApproversApproved =
    approverLines.length > 0 && approverLines.every((l) => l.status === 'approved')

  if (doc.status === 'approved') {
    if (hasCoop && !allCoopDone) {
      return one('결재완료/협조대기', 'bg-emerald-50 text-emerald-900 border-emerald-400 font-black')
    }
    return one('최종승인', 'bg-green-100 text-green-800 border-green-400 font-black')
  }

  if (doc.status === 'submitted' || doc.status === 'in_review') {
    /**
     * 최종 결재자 승인 후 협조만 남는 경우: `approval_docs`는 아직 `in_review`인데
     * 다음 `pending`이 협조 라인일 수 있음 → "결재,협조진행중"으로 떨어지지 않도록 처리.
     */
    if (allApproversApproved && hasCoop && !allCoopDone) {
      return one('결재완료/협조대기', 'bg-emerald-50 text-emerald-900 border-emerald-400 font-black')
    }

    const pending = L.find((l) => l.status === 'pending')
    if (
      pending &&
      normalizeApprovalRole(pending.approver_role) === 'approver' &&
      hasCoop &&
      allCoopDone
    ) {
      return one('결재진행/협조완료', 'bg-indigo-50 text-indigo-900 border-indigo-400 font-black')
    }
    return one('결재,협조진행중', 'bg-blue-50 text-blue-900 border-blue-300 font-black')
  }

  return one(String(doc.status ?? ''), 'bg-gray-100 text-gray-600 font-bold')
}

export function getApprovalDocDetailedStatusLabel(
  doc: ApprovalDocLike,
  lines?: ApprovalWorkflowLineInput[] | null
): string {
  const remarks = doc.remarks || ''
  if (doc.status === 'draft' && remarks.includes(APPROVAL_RECALL_REMARK_MARKER)) return '상신취소·작성복귀'
  if (remarks.includes('취소 요청 중')) return '기안자 취소요청'
  if (remarks.includes('취소완료') && !remarks.includes('재고환원')) return remarks
  if (remarks.includes('취소승인')) return remarks
  if (remarks.includes('재고환원') || remarks.includes('결재 중 취소됨')) return '취소 완료됨'
  return getUnifiedApprovalWorkflowBadges(doc, lines ?? null)
    .map((b) => b.label)
    .join(' · ')
}

/** 통합 결재문서함·대시보드: 상태 뱃지 (취소 릴레이 비고는 별도, 그 외는 `getUnifiedApprovalWorkflowBadges`) */
export function getApprovalDocDetailedStatusPresentation(
  doc: ApprovalDocLike,
  lines?: ApprovalWorkflowLineInput[] | null
): { badges: ApprovalStatusBadge[] } {
  const remarks = doc.remarks || ''
  const one = (label: string, className: string): { badges: ApprovalStatusBadge[] } => ({
    badges: [{ label, className: badge(className) }],
  })

  if (doc.status === 'draft' && remarks.includes(APPROVAL_RECALL_REMARK_MARKER)) {
    return one('상신취소·작성복귀', 'bg-amber-50 text-amber-900 border-amber-400 font-black')
  }

  if (remarks.includes('취소 요청 중')) {
    return one('기안자 취소요청', 'bg-red-100 text-red-600 animate-pulse border-red-200')
  }
  if (remarks.includes('취소완료') && !remarks.includes('재고환원')) {
    return one(remarks, 'bg-orange-100 text-orange-600 animate-pulse border-orange-200')
  }
  if (remarks.includes('취소승인')) {
    return one(remarks, 'bg-orange-50 text-orange-500 border-orange-200')
  }
  if (remarks.includes('재고환원') || remarks.includes('결재 중 취소됨')) {
    return one('취소 완료됨', 'bg-gray-200 text-gray-500 font-bold border-gray-300')
  }

  return { badges: getUnifiedApprovalWorkflowBadges(doc, lines ?? null) }
}

/**
 * 출고요청 목록 화면: 요청 행(`outbound_requests`) + 결재 헤더/라인 기준 상태.
 * 통합함과 동일한 취소/결재 용어를 쓰되, 출고 실행 완료(`completed`)는 별도 표기.
 */
export function getOutboundRequestRowPresentation(input: {
  approvalDoc: ApprovalDocLike | null | undefined
  lines: ApprovalLineLike[]
  reqStatus: OutboundRequestStatus
  dispatchState?: OutboundDispatchState | null
}): { label: string; className: string } {
  const { approvalDoc: doc, lines, reqStatus, dispatchState } = input
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
    const b = getUnifiedApprovalWorkflowBadges(doc, sorted)
    return { label: b[0].label, className: b[0].className }
  }

  if (reqStatus === 'completed') {
    return { label: '출고완료', className: badge('bg-purple-100 text-purple-700 font-black border-purple-200 shadow-sm') }
  }

  if (reqStatus === 'approved') {
    if (dispatchState === 'assigned') {
      return { label: '출고대기', className: badge('bg-slate-100 text-slate-700 border-slate-300 font-black') }
    }
    if (dispatchState === 'in_progress') {
      return { label: '진행중', className: badge('bg-indigo-50 text-indigo-800 border-indigo-300 font-black') }
    }
    if (dispatchState === 'queue') {
      return { label: '출고대기', className: badge('bg-slate-100 text-slate-700 border-slate-300 font-black') }
    }
  }

  if (reqStatus === 'cancelled') {
    return { label: '취소 완료', className: badge('bg-gray-200 text-gray-500 font-bold line-through border-gray-300') }
  }

  const b = getUnifiedApprovalWorkflowBadges(doc, sorted)
  return { label: b[0].label, className: b[0].className }
}

export function getOutboundDispatchStatePresentation(
  state: OutboundDispatchState | null | undefined
): { label: string; className: string } {
  if (state === 'assigned' || state === 'queue' || state == null) {
    return { label: '출고대기', className: badge('bg-slate-100 text-slate-700 border-slate-300 font-black') }
  }
  if (state === 'in_progress') {
    return { label: '진행중', className: badge('bg-indigo-50 text-indigo-800 border-indigo-300 font-black') }
  }
  if (state === 'completed') {
    return { label: '출고완료', className: badge('bg-purple-100 text-purple-700 border-purple-200 font-black') }
  }
  return { label: '출고대기', className: badge('bg-slate-100 text-slate-700 border-slate-300 font-black') }
}

/** 결재 취소 릴레이 UI (`ApprovalActionButtons`)와 동일한 문자열 기준 */
export function isApprovalCancellationRemarkProcess(remarks: string | null | undefined) {
  const r = remarks || ''
  return r.includes('취소 요청') || r.includes('취소완료') || r.includes('취소승인')
}

/** `orderedApprovalFlow` 한 행과 동일한 최소 필드 */
export type ApprovalDirectCancelFlowRow = {
  line_no: number
  approver_id: string
  approver_role: string
  status: string
}

/**
 * 최종 승인(`approved`) 직후, 역순 릴레이 없이 `direct_cancel_final_approval` RPC로 끝낼 수 있는지.
 * 마지막으로 승인 처리한 결재·협조·참조 차수 담당자만 true.
 */
export function canLastApproverDirectCancelFinalApproval(input: {
  doc: Pick<ApprovalDocLike, 'status' | 'remarks'>
  orderedFlow: ApprovalDirectCancelFlowRow[]
  currentUserId: string
}): boolean {
  if (isApprovalCancellationRemarkProcess(input.doc.remarks)) return false
  if (input.doc.status !== 'approved') return false
  const actionApproved = input.orderedFlow.filter(
    (l) => isApprovalActionRole(l.approver_role) && l.status === 'approved'
  )
  if (actionApproved.length === 0) return false
  const last = actionApproved.reduce((a, b) => (a.line_no >= b.line_no ? a : b))
  const me = String(input.currentUserId).toLowerCase()
  return String(last.approver_id).toLowerCase() === me
}

export function getPendingApprovalLine(lines: ApprovalLineLike[]) {
  const sorted = [...lines].sort((a, b) => a.line_no - b.line_no)
  return sorted.find((line) => {
    const role = normalizeApprovalRole(line.approver_role)
    if (!role) return false
    return line.status === 'pending'
  })
}

/** 결재 목록「결재라인」열: 결재(approver) 역할만 순서대로 이름 연결 */
export type ApprovalLineWithName = {
  line_no: number
  status: string
  approver_role: string
  user_name: string
}

export function formatApproverLineNames(lines: ApprovalLineWithName[]): string {
  const sorted = [...lines].sort((a, b) => a.line_no - b.line_no)
  const names = sorted
    .filter((l) => isFinalApprovalRole(l.approver_role))
    .map((l) => (l.user_name || '').trim())
    .filter(Boolean)
  return names.length > 0 ? names.join('-') : '-'
}

/** 통합 결재문서함 「결재라인」열: `기안자-결재1-결재2` (이름만 하이픈 연결) */
export function formatInboxApproverLineDisplay(
  writerName: string | null | undefined,
  lines: ApprovalLineWithName[]
): string {
  const raw = (writerName ?? '').trim()
  const w = raw === '' || raw === '-' ? '—' : raw
  const approvers = formatApproverLineNames(lines)
  if (approvers === '-' || !approvers.trim()) return w
  return `${w}-${approvers}`
}

function progressRoleSuffix(role: string): string {
  const n = normalizeApprovalRole(role)
  if (n === 'approver') return '결재'
  if (n === 'reviewer') return '참조'
  if (n === 'cooperator') return '협조'
  return '결재'
}

export type ApprovalProgressDocInput = Pick<ApprovalDocLike, 'status' | 'remarks' | 'current_line_no'>

/**
 * 기안 취소·역순 취소 릴레이·회수 등 `ApprovalActionButtons`와 맞춘 진행 문구.
 * 일반 결재 진행과 겹치면 이 값을 우선합니다.
 */
export function formatCancellationProgressChain(doc: ApprovalProgressDocInput): string | null {
  const r = doc.remarks || ''

  if (r.includes('관리자 강제취소')) {
    return '취소처리완료(관리자강제·재고환원)'
  }
  if (r.includes('취소 완료(재고환원)') || (r.includes('재고환원') && r.includes('취소 완료'))) {
    return '취소처리완료(재고환원)'
  }
  if (r.includes('결재 중 취소됨')) {
    return '취소완료(결재진행 중·철회)'
  }
  if (r.includes('취소승인')) {
    return '기안완료 › 최종승인완료 › 역순취소 › 취소승인통과 › 기안자 재고환원 대기'
  }
  if (r.includes('취소완료') && !r.includes('재고환원')) {
    const tail = r.trim() || '역순취소단계'
    return `기안완료 › 최종승인완료 › 역순취소진행 › ${tail}`
  }
  if (r.includes('취소 요청')) {
    return '기안완료 › 최종승인완료 › 취소요청(결재선 역순·처리대기)'
  }

  return null
}

/**
 * 결재 목록「순번」열: 기안완료, 김영태결재완료, … 형태의 진행 문구
 */
export function formatApprovalProgressChain(doc: ApprovalProgressDocInput, lines: ApprovalLineWithName[]): string {
  const sorted = [...lines].sort((a, b) => a.line_no - b.line_no)

  if (doc.status === 'draft') {
    const r = doc.remarks || ''
    if (r.includes(APPROVAL_RECALL_REMARK_MARKER)) return '기안회수(상신취소·작성복귀)'
    return '임시저장'
  }

  const cancelLabel = formatCancellationProgressChain(doc)
  if (cancelLabel != null) {
    return cancelLabel
  }

  const parts: string[] = ['기안완료']

  if (sorted.length === 0) {
    if (doc.status === 'rejected') {
      parts.push(isRejectedAsPostApprovalCancel(doc) ? '결재취소' : '반려됨')
      return parts.join(' › ')
    }
    return parts.join(' › ')
  }

  for (const line of sorted) {
    const name = (line.user_name || '').trim() || '이름없음'
    const suf = progressRoleSuffix(line.approver_role)
    const st = String(line.status || '').toLowerCase()

    if (st === 'approved') {
      parts.push(`${name}${suf}완료`)
      continue
    }
    if (st === 'rejected') {
      parts.push(`${name}${suf}반려`)
      break
    }
    if (st === 'pending') {
      parts.push(`${name}${suf}대기중`)
      break
    }
    if (st === 'waiting') {
      break
    }
  }

  if (
    doc.status === 'rejected' &&
    !parts.some((p) => p.includes('반려') || p.includes('결재취소'))
  ) {
    parts.push(isRejectedAsPostApprovalCancel(doc) ? '결재취소' : '반려됨')
  }

  return parts.join(' › ')
}
