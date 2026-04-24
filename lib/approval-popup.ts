import { getDocDetailOpenHref, getDocDetailViewHref, type ApprovalDocLike } from '@/lib/approval-status'

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
  const winName = url.includes('/outbound-requests/view/')
    ? `outboundReqView_${url.split('/').pop()}`
    : `approvalDocView_${doc.id}`
  openApprovalShellPopup(url, winName)
}

type InboxDoc = ApprovalDocLike & { id: number; writer_id?: string | null }

/** 통합함·대시보드: 기안자·수정 가능 문서는 edit 팝업, 나머지는 view 팝업. */
export function openApprovalDocFromInbox(doc: InboxDoc, currentUserId: string | null | undefined) {
  const url = getDocDetailOpenHref(doc, currentUserId)
  const resubmitMatch = url.match(/[?&]resubmit=(\d+)/)
  const winName = url.includes('/outbound-requests/view/')
    ? `outboundReqView_${url.split('/').pop()}`
    : resubmitMatch
      ? `approvalResubmit_${resubmitMatch[1]}`
      : `approvalDocView_${doc.id}`
  openApprovalShellPopup(url, winName)
}

export function openOutboundRequestDetailViewPopup(outboundRequestId: number) {
  const url = `/outbound-requests/view/${outboundRequestId}`
  openApprovalShellPopup(url, `outboundReqView_${outboundRequestId}`)
}
