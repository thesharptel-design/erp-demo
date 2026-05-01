# Approval Workflow V2 Plan

## Current State

ERP 결재라인 v2는 1차 구현과 정적 검증까지 완료된 상태다. 역할 분리, 서버 액션 API, 새 버튼 UI, Tooltip 설명, 재상신 문서번호 유지, 출고요청기안 완료 상태 호환, DB migration 초안이 들어갔다.

아직 운영 완료 판정 전이다. Supabase migration 적용은 완료했고, 실제 화면 흐름 검수가 남아 있다.

## Locked Business Rules

- 기안자는 상신 후 아무도 처리하지 않았을 때만 `기안회수`로 임시저장 복귀할 수 있다.
- 협조/결재가 하나라도 처리된 뒤에는 기안자 직접 취소가 아니라 `취소요청`만 가능하다.
- 사전협조자는 `협조확인`만 가능하며 승인/반려 권한이 없다.
- 결재자는 `승인`, `전결승인`, `직권반려`, `순차반려`, `선택반려`를 수행할 수 있다.
- 참조자는 열람만 가능하며 액션 버튼이 없다.
- 최종승인 후 원문서 직접 취소/반려/수정은 v1에서 금지한다.
- 출고요청기안은 최종승인 후 재고/출고 흐름이 시작되므로, 완료 후 취소는 나중에 별도 취소/정정/폐기 기안으로 확장한다.

## Implemented In This Pass

- Roles:
  - `pre_cooperator`
  - `approver`
  - `post_cooperator`
  - `reference`
- Line statuses used by v2:
  - `waiting`
  - `pending`
  - `confirmed`
  - `approved`
  - `rejected`
  - `skipped`
- Document statuses used by v2:
  - existing `draft`, `submitted`, `in_review`, `approved`, `rejected`
  - new transition targets `in_progress`, `effective`, `closed`
- Server endpoint:
  - `POST /api/approvals/actions`
- Detail/user permission alignment:
  - 일반기안 상세와 출고요청기안 상세 모두 `app_users.id` 기준으로 현재 사용자를 맞춘다.
- Main client entry:
  - `components/ApprovalActionButtons.tsx`
- Migration:
  - `supabase/migrations/20260501120000_approval_workflow_role_state_v2.sql`
  - `supabase/migrations/20260501133000_approval_inbox_sort_effective_closed_last.sql`
- Notification compatibility:
  - `fanout_work_approval_notification`이 `pre_cooperator`, `approver`, `post_cooperator` 역할을 알림 대상으로 인식하도록 migration에 보강했다.
- Inbox compatibility:
  - 일반기안/출고요청 목록이 v2 반려 이력(`reject_direct`, `reject_sequential`, `reject_targeted`)과 완료 상태(`effective`, `closed`)를 함께 인식한다.

## Manual QA Checklist

Run this with one general draft and one outbound request draft.

1. Create line: `기안자 -> 사전협조자 -> 결재1 -> 결재2 -> 결재3`.
2. Before anyone acts, writer sees `기안회수`; click returns doc to `draft`.
3. Submit again; 사전협조자 sees only `협조확인`.
4. Before 협조확인, 결재1/2/3 should not be able to normal approve.
5. After 협조확인, 결재1 sees `승인` and 반려 buttons.
6. 결재2 can use `순차반려` after 결재1 approval.
7. 결재3 can use `선택반려` to a previous processed line.
8. 결재3 can use `전결승인`; remaining pending/waiting action lines become `skipped`.
9. After final approval, original cancel/reject/revoke buttons are not visible.
10. If 사후협조자 exists, `사후확인` appears only after final approval.
11. After all post cooperators confirm, doc becomes `closed`.
12. Outbound request final approval should not expose direct original cancellation.

## Verification Status

- `npm.cmd run typecheck`: passed.
- `npm.cmd test -- lib/approval-participants.test.ts lib/approval-status.test.ts lib/approval-line-opinions.test.ts`: passed, 56 tests.
- `npm.cmd run build`: passed after allowing network access for Google Fonts.
- Supabase migrations: applied.

## Follow-Up Implementation Notes

- If old rows have `cooperator`, the app treats them as `pre_cooperator`.
- If old rows have `reviewer`, the app treats them as `reference`.
- The server endpoint is the authority for action permission; UI hiding is only convenience.
- Notification fanout should not be allowed to make a valid approval mutation fail.
- Sequential/targeted rejection keeps the document in progress, moves the chosen previous processed line back to `pending`, and resets later lines to `waiting`.
- Post-effective cancel/correction/void should remain hidden until the client explicitly enables that policy.
