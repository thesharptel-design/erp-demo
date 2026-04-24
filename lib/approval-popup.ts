import { getDocDetailViewHref, type ApprovalDocLike } from '@/lib/approval-status'

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

export function openOutboundRequestDetailViewPopup(outboundRequestId: number) {
  const url = `/outbound-requests/view/${outboundRequestId}`
  openApprovalShellPopup(url, `outboundReqView_${outboundRequestId}`)
}
