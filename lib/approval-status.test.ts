import { describe, expect, it } from 'vitest'
import {
  formatApprovalProgressChain,
  formatApproverLineNames,
  formatCancellationProgressChain,
  formatInboxApproverLineDisplay,
  getApprovalDocDetailedStatusLabel,
  getApprovalDocDetailedStatusPresentation,
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
  it('shows 상신취소·작성복귀 when draft was recalled', () => {
    expect(
      getApprovalDocDetailedStatusLabel({
        status: 'draft',
        remarks: '기안 회수됨',
        current_line_no: null,
        doc_type: 'outbound_request',
      })
    ).toBe('상신취소·작성복귀')
  })

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

  it('maps in_review without lines to unified 진행중', () => {
    expect(
      getApprovalDocDetailedStatusLabel({
        status: 'in_review',
        remarks: null,
        current_line_no: 2,
        doc_type: 'draft_doc',
      })
    ).toBe('결재,협조진행중')
    expect(
      getApprovalDocDetailedStatusLabel({
        status: 'submitted',
        remarks: null,
        current_line_no: 3,
        doc_type: 'draft_doc',
      })
    ).toBe('결재,협조진행중')
  })
})

describe('formatCancellationProgressChain', () => {
  it('maps cancel request and relay remarks', () => {
    expect(formatCancellationProgressChain({ status: 'approved', remarks: '취소 요청 중', current_line_no: 1 })).toContain(
      '취소요청'
    )
    expect(
      formatCancellationProgressChain({ status: 'approved', remarks: '결재자 취소완료', current_line_no: 1 })
    ).toContain('역순취소진행')
    expect(formatCancellationProgressChain({ status: 'approved', remarks: '결재자 취소승인', current_line_no: 0 })).toContain(
      '재고환원 대기'
    )
    expect(
      formatCancellationProgressChain({ status: 'rejected', remarks: '취소 완료(재고환원)', current_line_no: null })
    ).toBe('취소처리완료(재고환원)')
    expect(formatCancellationProgressChain({ status: 'rejected', remarks: '결재 중 취소됨', current_line_no: null })).toContain(
      '결재진행'
    )
    expect(formatCancellationProgressChain({ status: 'approved', remarks: null, current_line_no: 1 })).toBeNull()
  })
})

describe('getApprovalDocDetailedStatusPresentation', () => {
  it('returns 결재완료/협조대기 when approved but cooperator still waiting', () => {
    const pres = getApprovalDocDetailedStatusPresentation(
      { status: 'approved', remarks: null, current_line_no: null, doc_type: 'draft_doc' },
      [
        { line_no: 1, approver_role: 'approver', status: 'approved' },
        { line_no: 2, approver_role: 'cooperator', status: 'waiting' },
      ]
    )
    expect(pres.badges.map((b) => b.label)).toEqual(['결재완료/협조대기'])
  })

  it('returns single 최종승인 when approved and no pending cooperator', () => {
    const pres = getApprovalDocDetailedStatusPresentation(
      { status: 'approved', remarks: null, current_line_no: null, doc_type: 'draft_doc' },
      [
        { line_no: 1, approver_role: 'approver', status: 'approved' },
        { line_no: 2, approver_role: 'cooperator', status: 'approved' },
      ]
    )
    expect(pres.badges.map((b) => b.label)).toEqual(['최종승인'])
  })

  it('returns 결재진행/협조완료 when next pending is approver and all cooperators approved', () => {
    const pres = getApprovalDocDetailedStatusPresentation(
      { status: 'in_review', remarks: null, current_line_no: 3, doc_type: 'draft_doc' },
      [
        { line_no: 1, approver_role: 'approver', status: 'approved' },
        { line_no: 2, approver_role: 'cooperator', status: 'approved' },
        { line_no: 3, approver_role: 'approver', status: 'pending' },
      ]
    )
    expect(pres.badges.map((b) => b.label)).toEqual(['결재진행/협조완료'])
  })

  it('returns 결재완료/협조대기 when doc still in_review but all approvers approved and cooperator pending (사후 협조)', () => {
    const pres = getApprovalDocDetailedStatusPresentation(
      { status: 'in_review', remarks: null, current_line_no: 4, doc_type: 'draft_doc' },
      [
        { line_no: 1, approver_role: 'approver', status: 'approved' },
        { line_no: 2, approver_role: 'approver', status: 'approved' },
        { line_no: 3, approver_role: 'cooperator', status: 'pending' },
      ]
    )
    expect(pres.badges.map((b) => b.label)).toEqual(['결재완료/협조대기'])
  })

  it('returns 상신취소·작성복귀 badge when draft with 기안 회수됨', () => {
    const pres = getApprovalDocDetailedStatusPresentation(
      { status: 'draft', remarks: '기안 회수됨', current_line_no: 1, doc_type: 'outbound_request' },
      []
    )
    expect(pres.badges.map((b) => b.label)).toEqual(['상신취소·작성복귀'])
  })
})

describe('formatApprovalProgressChain', () => {
  it('shows 임시저장 for draft', () => {
    expect(formatApprovalProgressChain({ status: 'draft', remarks: null, current_line_no: null }, [])).toBe('임시저장')
  })

  it('shows 기안회수 when draft with 회수 remarks', () => {
    expect(formatApprovalProgressChain({ status: 'draft', remarks: '기안 회수됨', current_line_no: null }, [])).toBe(
      '기안회수(상신취소·작성복귀)'
    )
  })

  it('chains 기안완료 with approver pending', () => {
    const s = formatApprovalProgressChain(
      { status: 'in_review', remarks: null, current_line_no: 2 },
      [
        { line_no: 1, status: 'approved', approver_role: 'reviewer', user_name: '이참조' },
        { line_no: 2, status: 'pending', approver_role: 'approver', user_name: '김영태' },
      ]
    )
    expect(s).toContain('기안완료')
    expect(s).toContain('이참조참조완료')
    expect(s).toContain('김영태결재대기중')
  })

  it('joins approver names for 결재라인', () => {
    expect(
      formatApproverLineNames([
        { line_no: 1, status: 'approved', approver_role: 'reviewer', user_name: '무시' },
        { line_no: 2, status: 'pending', approver_role: 'approver', user_name: '김영태' },
        { line_no: 3, status: 'waiting', approver_role: 'approver', user_name: '박형배' },
      ])
    ).toBe('김영태-박형배')
  })

  it('joins inbox 결재라인 as 기안자-결재(이름만)', () => {
    expect(
      formatInboxApproverLineDisplay('이기안', [
        { line_no: 1, status: 'pending', approver_role: 'approver', user_name: '김영태' },
      ])
    ).toBe('이기안-김영태')
    expect(formatInboxApproverLineDisplay('이기안', [])).toBe('이기안')
    expect(formatInboxApproverLineDisplay(null, [])).toBe('—')
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
