import { getDocDetailOpenHref, getDocDetailViewHref, type ApprovalDocLike } from '@/lib/approval-status'
import { getApprovalPopupWindowName } from '@/lib/approval-doc-type-rules'

/** `window.open` features string aligned with draft compose popups. */
export const APPROVAL_SHELL_POPUP_FEATURES =
  'popup=yes,width=1280,height=920,scrollbars=yes,resizable=yes' as const

export function openApprovalShellPopup(url: string, windowName: string): Window | null {
  if (typeof window === 'undefined') return null
  const popup = window.open(url, windowName, APPROVAL_SHELL_POPUP_FEATURES)
  if (!popup) {
    window.location.href = url
    return null
  }
  popup.focus()
  return popup
}

/** 통합함·대시보드 등: 문서 상세를 베어 셸 view 라우트로 연다. */
export function openApprovalDocDetailViewPopup(doc: ApprovalDocLike & { id: number }) {
  const url = getDocDetailViewHref(doc)
  const outboundIdRaw = doc.outbound_requests
  const outboundRequestId = outboundIdRaw
    ? (Array.isArray(outboundIdRaw) ? outboundIdRaw[0]?.id : outboundIdRaw.id)
    : null
  const winName = getApprovalPopupWindowName({
    docType: doc.doc_type,
    mode: 'view',
    approvalDocId: doc.id,
    outboundRequestId: outboundRequestId != null ? Number(outboundRequestId) : null,
    writerId: null,
    currentUserId: null,
    status: doc.status,
  })
  openApprovalShellPopup(url, winName)
}

type InboxDoc = ApprovalDocLike & { id: number; writer_id?: string | null }

/** 통합함·대시보드: 기안자·수정 가능 문서는 edit 팝업, 나머지는 view 팝업. */
export function openApprovalDocFromInbox(doc: InboxDoc, currentUserId: string | null | undefined) {
  const url = getDocDetailOpenHref(doc, currentUserId)
  const outboundIdRaw = doc.outbound_requests
  const outboundRequestId = outboundIdRaw
    ? (Array.isArray(outboundIdRaw) ? outboundIdRaw[0]?.id : outboundIdRaw.id)
    : null
  const resubmitMatch = url.match(/[?&]resubmit=(\d+)/)
  const winName = getApprovalPopupWindowName({
    docType: doc.doc_type,
    mode: 'open',
    approvalDocId: doc.id,
    outboundRequestId: outboundRequestId != null ? Number(outboundRequestId) : null,
    writerId: doc.writer_id ?? null,
    currentUserId,
    status: doc.status,
    resubmitDocId: resubmitMatch ? Number(resubmitMatch[1]) : null,
  })
  openApprovalShellPopup(url, winName)
}

export function openOutboundRequestDetailViewPopup(
  outboundRequestId: number,
  options?: { source?: 'instructions' | 'approvals' }
) {
  const source = options?.source
  const url =
    source === 'instructions'
      ? `/outbound-requests/view/${outboundRequestId}?from=instructions`
      : `/outbound-requests/view/${outboundRequestId}`
  const winName = getApprovalPopupWindowName({
    docType: 'outbound_request',
    mode: 'view',
    approvalDocId: outboundRequestId,
    outboundRequestId,
    writerId: null,
    currentUserId: null,
    status: 'submitted',
  })
  openApprovalShellPopup(url, winName)
}
