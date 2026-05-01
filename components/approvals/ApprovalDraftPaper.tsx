'use client'

import type { ReactNode } from 'react'
import SearchableCombobox, { type ComboboxOption } from '@/components/SearchableCombobox'
import type { ApprovalRole } from '@/lib/approval-roles'
import ApprovalLineDnD from '@/components/approvals/ApprovalLineDnD'
import ExecutionDateHybridInput from '@/components/approvals/ExecutionDateHybridInput'
import ApprovalDraftRichEditor from '@/components/approvals/ApprovalDraftRichEditor'
import { isHtmlContentEffectivelyEmpty } from '@/lib/html-content'

export type ApprovalDraftAppUser = {
  id: string
  /** 로그인 이메일과 매칭해 `app_users.id`를 찾을 때 사용 */
  email?: string | null
  login_id: string
  user_name: string
  employee_no?: string | null
  dept_id: number | null
  department?: string | null
  user_kind?: string | null
  training_program?: string | null
  school_name?: string | null
  teacher_subject?: string | null
  role_name: string
  can_approval_participate: boolean
}

export type ApprovalOrderItem = {
  id: string
  role: ApprovalRole
  userId: string
}

type ApprovalDraftPaperProps = {
  docType: string
  docTypeOptions: ComboboxOption[]
  onDocTypeChange: (value: string) => void
  title: string
  onTitleChange: (value: string) => void
  content: string
  onContentChange: (value: string) => void
  executionStartDate: string
  executionEndDate: string
  agreementText: string
  onExecutionStartDateChange: (value: string) => void
  onExecutionEndDateChange: (value: string) => void
  onAgreementTextChange: (value: string) => void
  writerName: string
  writerEmployeeNo?: string | null
  writerDeptName: string
  draftedDate: string
  /** 신규 기안 시 문서번호 안내 문구 (예: 상신 시 자동 부여) */
  documentNumberHint: string
  approvalOrder: ApprovalOrderItem[]
  selectableUsers: ApprovalDraftAppUser[]
  /** 결재선·참조·협조 표시용 사용자 조회 (작성자 포함 전체) */
  resolveLineUser: (userId: string) => ApprovalDraftAppUser | undefined
  deptMap: Map<number, string>
  onApprovalOrderRoleChange: (lineId: string, role: ApprovalRole) => void
  onApprovalOrderAssigneeChange: (lineId: string, userId: string) => void
  onApprovalOrderAdd: () => void
  onApprovalOrderRemove: (lineId: string) => void
  onApprovalOrderMove: (draggedId: string, targetId: string) => void
  /** 기본: 업무기안서 */
  paperTitle?: string
  paperSubtitle?: string
  /**
   * 본문 행 바로 아래, 동일 2열 그리드에 삽입 (왼쪽 라벨 고정 `출고`, 오른쪽에 슬롯).
   * 출고요청 작성 등에서 창고·품목 UI를 넣습니다.
   */
  postBodyGridSlot?: ReactNode
  /** 본문 아래 첨부 파일/문서 섹션 */
  attachmentsSlot?: ReactNode
  /** 본문·출고 사이: 재상신 시 이전 `approval_histories` 등 (읽기 전용) */
  processHistorySlot?: ReactNode
  /** true면 문서유형을 콤보 대신 고정 라벨로만 표시 */
  docTypeSelectDisabled?: boolean
}

function formatReferenceLine(order: ApprovalOrderItem[], resolveLineUser: (id: string) => ApprovalDraftAppUser | undefined) {
  const parts = order
    .filter((l) => l.role === 'reference' && l.userId.trim())
    .map((l) => {
      const u = resolveLineUser(l.userId)
      if (!u) return ''
      return u.user_name
    })
    .filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : '—'
}

export default function ApprovalDraftPaper({
  docType,
  docTypeOptions,
  onDocTypeChange,
  title,
  onTitleChange,
  content,
  onContentChange,
  executionStartDate,
  executionEndDate,
  agreementText,
  onExecutionStartDateChange,
  onExecutionEndDateChange,
  onAgreementTextChange,
  writerName,
  writerEmployeeNo,
  writerDeptName,
  draftedDate,
  documentNumberHint,
  approvalOrder,
  selectableUsers,
  resolveLineUser,
  deptMap,
  onApprovalOrderRoleChange,
  onApprovalOrderAssigneeChange,
  onApprovalOrderAdd,
  onApprovalOrderRemove,
  onApprovalOrderMove,
  paperTitle = '업무기안서',
  paperSubtitle = '문서 작성 후 결재선을 지정해 바로 상신합니다.',
  postBodyGridSlot,
  attachmentsSlot,
  processHistorySlot,
  docTypeSelectDisabled = false,
}: ApprovalDraftPaperProps) {
  /** 기안 다음 열: 결재선 순서대로 협조·결재 모두 표시 (참조는 별도 란) */
  const stampSlots = approvalOrder.filter(
    (l) => l.role === 'approver' || l.role === 'pre_cooperator' || l.role === 'post_cooperator'
  )
  const approvalStampColCount = 1 + stampSlots.length
  const requiresExecutionDate = docType === 'leave_request'

  return (
    <div className="overflow-x-auto">
      <div className="w-full min-w-0 space-y-4 rounded-xl border-2 border-border bg-card p-3 font-sans antialiased sm:p-4 md:min-w-[860px]">
        <div className="space-y-3 border-b-2 border-border pb-4">
          <div>
            <h3 className="text-xl font-black tracking-tight text-foreground sm:text-2xl">{paperTitle}</h3>
            <p className="mt-1 text-xs font-bold text-muted-foreground">{paperSubtitle}</p>
          </div>

          <div className="grid overflow-hidden rounded-md border-2 border-border lg:grid-cols-[16.875rem_minmax(0,1fr)]">
              <table className="w-full table-fixed border-collapse border-b border-border text-left text-xs lg:border-b-0 lg:border-r">
                <tbody>
                  <tr className="border-b border-border">
                    <th className="w-[32%] border-r border-border bg-muted px-2 py-1.5 font-black text-foreground">기안자</th>
                    <td className="px-2 py-1.5 font-bold text-foreground">{writerName || '—'}</td>
                  </tr>
                  <tr className="border-b border-border">
                    <th className="border-r border-border bg-muted px-2 py-1.5 font-black text-foreground">부서</th>
                    <td className="px-2 py-1.5 font-bold text-foreground">{writerDeptName || '—'}</td>
                  </tr>
                  <tr className="border-b border-border">
                    <th className="border-r border-border bg-muted px-2 py-1.5 font-black text-foreground">사번</th>
                    <td className="px-2 py-1.5 font-bold text-foreground">{writerEmployeeNo?.trim() || '—'}</td>
                  </tr>
                  <tr className="border-b border-border">
                    <th className="border-r border-border bg-muted px-2 py-1.5 font-black text-foreground">기안일</th>
                    <td className="px-2 py-1.5 font-bold text-foreground">{draftedDate}</td>
                  </tr>
                  <tr>
                    <th className="border-r border-border bg-muted px-2 py-1.5 font-black text-foreground">문서번호</th>
                    <td className="px-2 py-1.5 font-bold text-muted-foreground">{documentNumberHint}</td>
                  </tr>
                </tbody>
              </table>

              <div className="flex min-h-0 min-w-0 items-stretch justify-center overflow-x-auto bg-card lg:min-h-0">
                <table className="h-full w-full min-w-0 table-fixed border-collapse text-center text-xs sm:min-w-[260px]">
                  <colgroup>
                    {Array.from({ length: approvalStampColCount }).map((_, i) => (
                      <col key={i} style={{ width: `${100 / approvalStampColCount}%` }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr className="border-b border-border bg-muted">
                      <th className="border-r border-border px-1.5 py-1.5 font-black text-foreground sm:px-2 sm:py-2">기안</th>
                      {stampSlots.map((line) => (
                        <th key={line.id} className="border-l border-border px-1.5 py-1.5 font-black text-foreground sm:px-2 sm:py-2">
                          {line.role === 'pre_cooperator'
                            ? '사전협조'
                            : line.role === 'post_cooperator'
                              ? '사후협조'
                              : '결재'}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border">
                      <td className="min-w-0 border-r border-border bg-card px-1.5 py-2 font-bold text-foreground sm:px-2 sm:py-2.5">
                        <span className="block truncate">{writerName || '—'}</span>
                        <span className="mt-0.5 block truncate text-[10px] font-bold text-muted-foreground">
                          {writerEmployeeNo?.trim() || '-'}
                        </span>
                      </td>
                      {stampSlots.map((line) => {
                        const u = line.userId.trim() ? resolveLineUser(line.userId) : undefined
                        return (
                          <td
                            key={line.id}
                            className="min-w-0 border-l border-border bg-card px-1.5 py-2 font-bold text-foreground sm:px-2 sm:py-2.5"
                          >
                            <span className="block truncate">
                              {u?.user_name ?? (line.userId.trim() ? '—' : '미지정')}
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] font-bold text-muted-foreground">
                              {u?.employee_no?.trim() || '-'}
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                    <tr>
                      <td className="border-r border-border bg-muted/45 px-1 py-3 align-middle text-[10px] font-bold text-muted-foreground sm:px-2 sm:py-4">
                        서명/날인
                      </td>
                      {stampSlots.map((line) => (
                        <td
                          key={`sig-${line.id}`}
                          className="border-l border-border bg-muted/45 px-1 py-3 align-middle sm:px-2 sm:py-4"
                        >
                          <span className="text-[10px] font-bold text-muted-foreground">서명/날인</span>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
          </div>
        </div>

        <div className="grid grid-cols-1 overflow-hidden rounded-md border border-border text-sm sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr]">
          <div className="border-b bg-muted/45 px-3 py-2 font-black text-foreground sm:border-r">시행일자</div>
          <div className="grid grid-cols-1 items-center gap-2 border-b px-3 py-2 min-[430px]:grid-cols-[1fr_auto_1fr]">
            <ExecutionDateHybridInput
              value={executionStartDate}
              onChange={onExecutionStartDateChange}
              required={requiresExecutionDate}
              placeholder="시작일 (YYYYMMDD)"
              calendarLabel="시작일 달력"
            />
            <span className="hidden text-xs font-bold text-muted-foreground min-[430px]:inline">~</span>
            <ExecutionDateHybridInput
              value={executionEndDate}
              onChange={onExecutionEndDateChange}
              required={requiresExecutionDate}
              placeholder="종료일 (YYYYMMDD)"
              calendarLabel="종료일 달력"
            />
          </div>
          <div className="border-b bg-muted/45 px-3 py-2 font-black text-foreground sm:border-r">문서유형</div>
          <div className="border-b px-3 py-2">
            {docTypeSelectDisabled ? (
              <span className="inline-block rounded-md border border-border bg-muted/45 px-3 py-2 text-sm font-bold text-foreground">
                {docTypeOptions.find((o) => o.value === docType)?.label ?? docType}
              </span>
            ) : (
              <SearchableCombobox
                value={docType}
                onChange={onDocTypeChange}
                options={docTypeOptions}
                placeholder="문서 유형"
                showClearOption={false}
              />
            )}
          </div>
          <div className="border-b bg-muted/45 px-3 py-2 font-black text-foreground sm:border-r">참조</div>
          <div className="border-b px-3 py-2">
            <p className="rounded-md border border-dashed border-border bg-muted/45 px-3 py-2 text-sm font-bold text-foreground">
              {formatReferenceLine(approvalOrder, resolveLineUser)}
            </p>
            <p className="mt-1 text-[11px] font-bold text-muted-foreground">
              결재 라인에서 역할을 &quot;참조&quot;로 지정한 사람이 자동으로 표시됩니다.
            </p>
          </div>
          <div className="border-b bg-muted/45 px-3 py-2 font-black text-foreground sm:border-r">합의</div>
          <div className="border-b px-3 py-2">
            <textarea
              value={agreementText}
              onChange={(e) => onAgreementTextChange(e.target.value)}
              rows={2}
              placeholder="합의 내용을 입력하세요"
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            />
          </div>
          <div className="border-b bg-muted/45 px-3 py-2 font-black text-foreground sm:border-r">제목</div>
          <div className="border-b px-3 py-2">
            <input
              name="draft_title"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="기안 제목"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              required
            />
          </div>
          <div className="border-b bg-muted/45 px-3 py-2 font-black text-foreground sm:border-r">본문</div>
          <div className="border-b px-3 py-2">
            {/* TipTap은 폼 제약 검사 대상이 아니므로, 본문 비었을 때 브라우저 기본 검증(이 입력란을 작성하세요)용 게이트 */}
            <input
              type="text"
              name="draft_body_gate"
              required
              aria-label="본문"
              value={isHtmlContentEffectivelyEmpty(content) ? '' : 'OK'}
              onChange={() => {}}
              tabIndex={-1}
              className="sr-only"
            />
            <ApprovalDraftRichEditor value={content} onChange={onContentChange} />
          </div>
          {processHistorySlot ? (
            <>
              <div className="border-b bg-muted/45 px-3 py-2 font-black text-foreground sm:border-r">
                처리 이력
                <span className="mt-0.5 block text-[10px] font-bold normal-case text-muted-foreground">
                  이전 상신·결재 기록 (읽기 전용)
                </span>
              </div>
              <div className="border-b px-3 py-2">{processHistorySlot}</div>
            </>
          ) : null}
          {postBodyGridSlot ? (
            <>
              <div className="border-b bg-muted/45 px-3 py-2 font-black text-foreground sm:border-r">출고</div>
              <div className="border-b px-3 py-2">{postBodyGridSlot}</div>
            </>
          ) : null}
          {attachmentsSlot ? (
            <>
              <div className="border-b bg-muted/45 px-3 py-2 font-black text-foreground sm:border-r">첨부문서</div>
              <div className="border-b px-3 py-2">{attachmentsSlot}</div>
            </>
          ) : null}
        </div>

        <div className="rounded-xl border border-border bg-muted/10 p-3">
          <h4 className="mb-3 text-sm font-black text-foreground">결재 라인 지정</h4>
          <ApprovalLineDnD
            lines={approvalOrder}
            users={selectableUsers}
            deptMap={deptMap}
            onLineRoleChange={onApprovalOrderRoleChange}
            onLineAssigneeChange={onApprovalOrderAssigneeChange}
            onLineAdd={onApprovalOrderAdd}
            onLineRemove={onApprovalOrderRemove}
            onLineMove={onApprovalOrderMove}
          />
        </div>
      </div>
    </div>
  )
}
