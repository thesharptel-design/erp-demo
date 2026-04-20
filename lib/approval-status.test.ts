import { describe, expect, it } from 'vitest'
import {
  getApprovalDocDetailedStatusLabel,
  getOutboundRequestRowPresentation,
  isApprovalCancellationRemarkProcess,
} from '@/lib/approval-status'

describe('isApprovalCancellationRemarkProcess', () => {
  it('detects cancellation flow remarks', () => {
    expect(isApprovalCancellationRemarkProcess('취소 요청 중')).toBe(true)
    expect(isApprovalCancellationRemarkProcess('결재자 취소완료')).toBe(true)
    expect(isApprovalCancellationRemarkProcess('검토자 취소승인')).toBe(true)
    expect(isApprovalCancellationRemarkProcess('결재자 반려')).toBe(false)
  })
})

describe('getApprovalDocDetailedStatusLabel', () => {
  it('prioritises cancellation remarks over status', () => {
    expect(
      getApprovalDocDetailedStatusLabel({
        status: 'approved',
        remarks: '취소 요청 중',
        current_line_no: 1,
        doc_type: 'outbound_request',
      })
    ).toBe('기안자 취소요청')
  })

  it('maps in_review line positions', () => {
    expect(
      getApprovalDocDetailedStatusLabel({
        status: 'in_review',
        remarks: null,
        current_line_no: 2,
        doc_type: 'draft_doc',
      })
    ).toBe('검토자 대기중')
    expect(
      getApprovalDocDetailedStatusLabel({
        status: 'submitted',
        remarks: null,
        current_line_no: 3,
        doc_type: 'draft_doc',
      })
    ).toBe('결재 대기중')
  })
})

describe('getOutboundRequestRowPresentation', () => {
  it('shows 출고 완료 when request is completed', () => {
    const p = getOutboundRequestRowPresentation({
      approvalDoc: { status: 'approved', remarks: null, current_line_no: null, doc_type: 'outbound_request' },
      lines: [],
      reqStatus: 'completed',
    })
    expect(p.label).toBe('출고 완료')
  })

  it('shows cancellation relay when remarks indicate reverse relay', () => {
    const p = getOutboundRequestRowPresentation({
      approvalDoc: {
        status: 'approved',
        remarks: '결재자 취소완료',
        current_line_no: 1,
        doc_type: 'outbound_request',
      },
      lines: [],
      reqStatus: 'approved',
    })
    expect(p.label).toBe('취소 릴레이 진행')
  })
})
