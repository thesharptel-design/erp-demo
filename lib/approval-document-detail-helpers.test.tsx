import { describe, expect, it } from 'vitest'
import { canViewApprovalDoc, getActionLabel, getDocStatusLabel } from '@/lib/approval-document-detail-helpers'

describe('approval document detail access guards', () => {
  const base = {
    writerId: 'writer-1',
    lines: [] as Array<{ approver_id: string }>,
    participants: [] as Array<{ user_id: string }>,
  }

  it('관리자는 항상 접근 가능하다', () => {
    expect(
      canViewApprovalDoc({
        ...base,
        isAdmin: true,
        currentUserId: null,
      })
    ).toBe(true)
  })

  it('비로그인 사용자는 접근 불가하다', () => {
    expect(
      canViewApprovalDoc({
        ...base,
        isAdmin: false,
        currentUserId: null,
      })
    ).toBe(false)
  })

  it('기안자는 접근 가능하다', () => {
    expect(
      canViewApprovalDoc({
        ...base,
        isAdmin: false,
        currentUserId: 'writer-1',
      })
    ).toBe(true)
  })

  it('결재선(approval_lines)에 포함된 사용자는 접근 가능하다', () => {
    expect(
      canViewApprovalDoc({
        ...base,
        isAdmin: false,
        currentUserId: 'approver-1',
        lines: [{ approver_id: 'approver-1' }],
      })
    ).toBe(true)
  })

  it('참여자(approval_participants)에 포함된 사용자는 접근 가능하다', () => {
    expect(
      canViewApprovalDoc({
        ...base,
        isAdmin: false,
        currentUserId: 'participant-1',
        participants: [{ user_id: 'participant-1' }],
      })
    ).toBe(true)
  })

  it('어떤 조건에도 해당하지 않으면 접근 불가하다', () => {
    expect(
      canViewApprovalDoc({
        ...base,
        isAdmin: false,
        currentUserId: 'outsider',
        lines: [{ approver_id: 'approver-1' }],
        participants: [{ user_id: 'participant-1' }],
      })
    ).toBe(false)
  })
})

describe('detail helper labels', () => {
  it('문서 상태 라벨을 기대 문자열로 매핑한다', () => {
    expect(getDocStatusLabel('draft')).toBe('임시저장')
    expect(getDocStatusLabel('submitted')).toBe('상신 완료')
    expect(getDocStatusLabel('in_review')).toBe('검토/결재 중')
    expect(getDocStatusLabel('approved')).toBe('결재완료')
    expect(getDocStatusLabel('rejected')).toBe('반려/취소')
  })

  it('처리 이력 라벨을 기대 문자열로 매핑한다', () => {
    expect(getActionLabel('submit')).toBe('상신')
    expect(getActionLabel('approve')).toBe('승인')
    expect(getActionLabel('reject')).toBe('반려')
    expect(getActionLabel('approve_revoke')).toBe('승인 철회')
    expect(getActionLabel('cancel_request')).toBe('취소 요청')
    expect(getActionLabel('cancel_relay')).toBe('역순 취소 처리')
    expect(getActionLabel('direct_cancel_final')).toBe('결재 취소(완결 후)')
    expect(getActionLabel('outbound_assign_handler')).toBe('출고 담당자 지정')
    expect(getActionLabel('outbound_reassign_handler')).toBe('출고 담당자 변경')
    expect(getActionLabel('outbound_recall_handler')).toBe('출고 담당자 회수')
    expect(getActionLabel('outbound_execute_self')).toBe('출고 직접 처리 시작')
    expect(getActionLabel('outbound_complete')).toBe('출고 처리 완료')
  })
})
