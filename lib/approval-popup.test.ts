import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  openApprovalShellPopup,
  openApprovalDocDetailViewPopup,
  openApprovalDocFromInbox,
  openOutboundRequestDetailViewPopup,
} from '@/lib/approval-popup'

function stubWindowWithOpen(openImpl: ReturnType<typeof vi.fn>, initialHref = '/current') {
  const location = { href: initialHref }
  const win = { open: openImpl, location }
  vi.stubGlobal('window', win as unknown as Window & typeof globalThis)
  return { location, open: openImpl }
}

describe('openApprovalShellPopup', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('팝업 차단 시(null) 동일 URL로 location 이동(폴백)', () => {
    const open = vi.fn().mockReturnValue(null)
    const { location } = stubWindowWithOpen(open)
    const url = '/approvals/view/42'
    expect(openApprovalShellPopup(url, 'approvalDocView_42')).toBeNull()
    expect(open).toHaveBeenCalledWith(url, 'approvalDocView_42', expect.any(String))
    expect(location.href).toBe(url)
  })

  it('팝업 성공 시 focus 호출·location은 유지', () => {
    const popup = { focus: vi.fn() }
    const open = vi.fn().mockReturnValue(popup)
    const { location } = stubWindowWithOpen(open)
    const before = location.href
    const r = openApprovalShellPopup('/approvals/view/1', 'x')
    expect(r).toBe(popup)
    expect(popup.focus).toHaveBeenCalledOnce()
    expect(location.href).toBe(before)
  })
})

describe('openApprovalDocDetailViewPopup', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('일반 문서는 /approvals/view/{id} 로 연다', () => {
    const open = vi.fn().mockReturnValue(null)
    const { location } = stubWindowWithOpen(open)
    openApprovalDocDetailViewPopup({
      id: 7,
      doc_type: 'draft_doc',
      status: 'submitted',
      remarks: null,
      current_line_no: 1,
    })
    expect(open).toHaveBeenCalledWith('/approvals/view/7', 'approvalDocView_7', expect.any(String))
    expect(location.href).toBe('/approvals/view/7')
  })

  it('출고 문서는 출고요청 상세(출고 행 id)로 연다', () => {
    const open = vi.fn().mockReturnValue(null)
    const { location } = stubWindowWithOpen(open)
    openApprovalDocDetailViewPopup({
      id: 99,
      doc_type: 'outbound_request',
      status: 'submitted',
      remarks: null,
      current_line_no: 1,
      outbound_requests: { id: 55 },
    })
    expect(open).toHaveBeenCalledWith('/outbound-requests/view/55', 'outboundReqView_55', expect.any(String))
    expect(location.href).toBe('/outbound-requests/view/55')
  })
})

describe('openApprovalDocFromInbox', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('기안자·반려면 작성(재상신) 팝업 URL·윈도우 이름', () => {
    const open = vi.fn().mockReturnValue(null)
    stubWindowWithOpen(open)
    openApprovalDocFromInbox(
      {
        id: 5,
        doc_type: 'draft_doc',
        status: 'rejected',
        remarks: null,
        current_line_no: null,
        writer_id: 'me',
      },
      'me'
    )
    expect(open).toHaveBeenCalledWith('/approvals/new?resubmit=5', 'approvalResubmit_5', expect.any(String))
  })

  it('결재 진행 중이면 view', () => {
    const open = vi.fn().mockReturnValue(null)
    stubWindowWithOpen(open)
    openApprovalDocFromInbox(
      {
        id: 5,
        doc_type: 'draft_doc',
        status: 'in_review',
        remarks: null,
        current_line_no: 2,
        writer_id: 'me',
      },
      'me'
    )
    expect(open).toHaveBeenCalledWith('/approvals/view/5', 'approvalDocView_5', expect.any(String))
  })
})

describe('openOutboundRequestDetailViewPopup', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('출고 view URL·윈도우 이름으로 연다', () => {
    const open = vi.fn().mockReturnValue(null)
    const { location } = stubWindowWithOpen(open)
    openOutboundRequestDetailViewPopup(12)
    expect(open).toHaveBeenCalledWith('/outbound-requests/view/12', 'outboundReqView_12', expect.any(String))
    expect(location.href).toBe('/outbound-requests/view/12')
  })
})
