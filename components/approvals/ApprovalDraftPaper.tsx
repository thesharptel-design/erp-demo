'use client'

import type { ReactNode } from 'react'
import SearchableCombobox, { type ComboboxOption } from '@/components/SearchableCombobox'
import type { ApprovalRole } from '@/lib/approval-roles'
import ApprovalLineDnD from '@/components/approvals/ApprovalLineDnD'
import ApprovalDraftRichEditor from '@/components/approvals/ApprovalDraftRichEditor'

export type ApprovalDraftAppUser = {
  id: string
  login_id: string
  user_name: string
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
  /** true면 문서유형을 콤보 대신 고정 라벨로만 표시 */
  docTypeSelectDisabled?: boolean
}

function formatReferenceLine(order: ApprovalOrderItem[], resolveLineUser: (id: string) => ApprovalDraftAppUser | undefined) {
  const parts = order
    .filter((l) => l.role === 'reviewer' && l.userId.trim())
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
  docTypeSelectDisabled = false,
}: ApprovalDraftPaperProps) {
  const approverSlots = approvalOrder.filter((l) => l.role === 'approver')
  const cooperatorSlots = approvalOrder.filter((l) => l.role === 'cooperator' && l.userId.trim())
  const approvalStampColCount = 1 + approverSlots.length

  return (
    <div className="overflow-x-auto">
      <div className="w-full min-w-0 space-y-4 rounded-xl border-2 border-black bg-white p-3 sm:p-4 md:min-w-[860px]">
        <div className="space-y-3 border-b-2 border-black pb-4">
          <div>
            <h3 className="text-xl font-black tracking-tight text-gray-900 sm:text-2xl">{paperTitle}</h3>
            <p className="mt-1 text-xs font-bold text-gray-500">{paperSubtitle}</p>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
            <table className="w-full table-fixed border border-black text-left text-xs lg:w-[300px] lg:flex-shrink-0">
              <tbody>
                <tr className="border-b border-black">
                  <th className="w-[28%] border-r border-black bg-gray-100 px-2 py-2 font-black text-gray-800">기안자</th>
                  <td className="px-2 py-2 font-bold text-gray-900">{writerName || '—'}</td>
                </tr>
                <tr className="border-b border-black">
                  <th className="border-r border-black bg-gray-100 px-2 py-2 font-black text-gray-800">부서</th>
                  <td className="px-2 py-2 font-bold text-gray-900">{writerDeptName || '—'}</td>
                </tr>
                <tr className="border-b border-black">
                  <th className="border-r border-black bg-gray-100 px-2 py-2 font-black text-gray-800">기안일</th>
                  <td className="px-2 py-2 font-bold text-gray-900">{draftedDate}</td>
                </tr>
                <tr>
                  <th className="border-r border-black bg-gray-100 px-2 py-2 font-black text-gray-800">문서번호</th>
                  <td className="px-2 py-2 font-bold text-gray-600">{documentNumberHint}</td>
                </tr>
              </tbody>
            </table>

            <div className="min-w-0 flex-1 space-y-2">
              <div className="overflow-x-auto rounded border border-black">
                <table className="w-full table-fixed border-collapse text-center text-xs">
                  <colgroup>
                    {Array.from({ length: approvalStampColCount }).map((_, i) => (
                      <col key={i} style={{ width: `${100 / approvalStampColCount}%` }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr className="border-b border-black bg-gray-100">
                      <th className="border-r border-black px-2 py-2 font-black text-gray-800">기안</th>
                      {approverSlots.map((line) => (
                        <th key={line.id} className="border-l border-black px-2 py-2 font-black text-gray-800">
                          결재
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-black">
                      <td className="min-w-0 border-r border-black bg-white px-2 py-3 font-bold text-gray-900">
                        <span className="block truncate">{writerName || '—'}</span>
                      </td>
                      {approverSlots.map((line) => {
                        const u = line.userId.trim() ? resolveLineUser(line.userId) : undefined
                        return (
                          <td
                            key={line.id}
                            className="min-w-0 border-l border-black bg-white px-2 py-3 font-bold text-gray-900"
                          >
                            <span className="block truncate">
                              {u?.user_name ?? (line.userId.trim() ? '—' : '미지정')}
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                    <tr>
                      <td className="border-r border-black bg-gray-50 px-1 py-8 align-top text-[10px] font-bold text-gray-400">
                        서명/날인
                      </td>
                      {approverSlots.map((line) => (
                        <td key={`sig-${line.id}`} className="border-l border-black bg-gray-50 px-1 py-8 align-top" />
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="rounded border border-gray-400 bg-gray-50 p-2">
                <p className="mb-2 border-b border-gray-300 pb-1 text-center text-[11px] font-black text-gray-800">협조</p>
                {cooperatorSlots.length === 0 ? (
                  <p className="py-2 text-center text-[11px] font-bold text-gray-500">
                    결재 라인에서 역할을 &quot;협조&quot;로 지정하면 이곳에 표시됩니다.
                  </p>
                ) : (
                  <table className="w-full border border-gray-300 bg-white text-left text-[11px]">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border-b border-gray-300 px-2 py-1 font-black">부서</th>
                        <th className="border-b border-l border-gray-300 px-2 py-1 font-black">이름</th>
                        <th className="border-b border-l border-gray-300 px-2 py-1 font-black">확인</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cooperatorSlots.map((line) => {
                        const u = resolveLineUser(line.userId)
                        const dept = u ? (deptMap.get(u.dept_id ?? -1) ?? '—') : '—'
                        return (
                          <tr key={line.id} className="border-t border-gray-200">
                            <td className="px-2 py-1.5 font-bold text-gray-800">{dept}</td>
                            <td className="border-l border-gray-200 px-2 py-1.5 font-bold text-gray-900">
                              {u?.user_name ?? '—'}
                            </td>
                            <td className="border-l border-gray-200 px-2 py-1.5">
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-800">
                                안읽음
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
                <p className="mt-1 text-[10px] font-bold text-gray-500">
                  읽음 여부는 상신 후 협조자가 문서를 열람하면 시스템에서 갱신하도록 연동할 수 있습니다. (작성 화면에서는 안내용으로
                  &quot;안읽음&quot;을 표시합니다.)
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 border border-gray-200 text-sm sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr]">
          <div className="border-b bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">시행일자</div>
          <div className="grid grid-cols-1 items-center gap-2 border-b px-3 py-2 min-[430px]:grid-cols-[1fr_auto_1fr]">
            <input
              type="date"
              value={executionStartDate}
              onChange={(e) => onExecutionStartDateChange(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
            <span className="hidden text-xs font-bold text-gray-500 min-[430px]:inline">~</span>
            <input
              type="date"
              value={executionEndDate}
              onChange={(e) => onExecutionEndDateChange(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="border-b bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">문서유형</div>
          <div className="border-b px-3 py-2">
            {docTypeSelectDisabled ? (
              <span className="inline-block rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-900">
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
          <div className="border-b bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">참조</div>
          <div className="border-b px-3 py-2">
            <p className="rounded border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-800">
              {formatReferenceLine(approvalOrder, resolveLineUser)}
            </p>
            <p className="mt-1 text-[11px] font-bold text-gray-500">
              결재 라인에서 역할을 &quot;참조&quot;로 지정한 사람이 자동으로 표시됩니다.
            </p>
          </div>
          <div className="border-b bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">합의</div>
          <div className="border-b px-3 py-2">
            <textarea
              value={agreementText}
              onChange={(e) => onAgreementTextChange(e.target.value)}
              rows={2}
              placeholder="합의 내용을 입력하세요"
              className="w-full resize-none rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="border-b bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">제목</div>
          <div className="border-b px-3 py-2">
            <input
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="기안 제목"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </div>
          <div className="border-b bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">본문</div>
          <div className="border-b px-3 py-2">
            <ApprovalDraftRichEditor value={content} onChange={onContentChange} />
          </div>
          {postBodyGridSlot ? (
            <>
              <div className="border-b bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">출고</div>
              <div className="border-b px-3 py-2">{postBodyGridSlot}</div>
            </>
          ) : null}
        </div>

        <div className="rounded-xl border border-gray-200 p-3">
          <h4 className="mb-3 text-sm font-black text-gray-800">결재 라인 지정</h4>
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
