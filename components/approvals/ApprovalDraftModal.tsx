'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ApprovalDraftPaper from '@/components/approvals/ApprovalDraftPaper'
import {
  APPROVAL_DRAFT_DOC_TYPE_OPTIONS,
} from '@/lib/approval-draft'
import { useApprovalDraftForm } from '@/components/approvals/useApprovalDraftForm'

type ApprovalDraftModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitted?: () => void
}

export default function ApprovalDraftModal({ open, onOpenChange, onSubmitted }: ApprovalDraftModalProps) {
  const {
    isLoading,
    isSaving,
    errorMessage,
    docType,
    setDocType,
    title,
    setTitle,
    content,
    setContent,
    executionStartDate,
    setExecutionStartDate,
    executionEndDate,
    setExecutionEndDate,
    cooperationDept,
    setCooperationDept,
    agreementText,
    setAgreementText,
    approvalOrder,
    setApprovalOrder,
    selectableUsers,
    deptMap,
    selectedWriter,
    writerHasApprovalRight,
    draftedDate,
    hasDraftContent,
    resetForm,
    submitDraft,
  } = useApprovalDraftForm({
    enabled: open,
    remarks: '문서함 모달 등록 문서',
    autosaveKey: 'approval-draft-modal-autosave-v1',
  })

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const ok = await submitDraft()
    if (ok) {
      onSubmitted?.()
      onOpenChange(false)
      resetForm()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(94vh,980px)] w-[min(1280px,98vw)] max-w-none flex-col overflow-hidden p-0"
        showCloseButton={!isSaving}
      >
        <DialogHeader className="border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
          <DialogTitle className="text-lg font-black text-gray-900 sm:text-xl">일반 기안 작성</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 sm:space-y-4 sm:px-6 sm:py-5">
            {hasDraftContent && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700">
                입력 내용은 자동으로 임시 저장되며, 창을 닫아도 다음에 복구됩니다.
              </div>
            )}
            {!isLoading && !writerHasApprovalRight && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
                작성자에게 결재권이 없어 상신할 수 없습니다. 관리자에게 결재권 부여를 요청하세요.
              </div>
            )}
            {errorMessage && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
                {errorMessage}
              </div>
            )}

            {isLoading ? (
              <div className="py-12 text-center text-sm font-bold text-gray-500">기안 정보를 불러오는 중...</div>
            ) : (
              <ApprovalDraftPaper
                docType={docType}
                docTypeOptions={APPROVAL_DRAFT_DOC_TYPE_OPTIONS}
                onDocTypeChange={setDocType}
                title={title}
                onTitleChange={setTitle}
                content={content}
                onContentChange={setContent}
                executionStartDate={executionStartDate}
                executionEndDate={executionEndDate}
                cooperationDept={cooperationDept}
                agreementText={agreementText}
                onExecutionStartDateChange={setExecutionStartDate}
                onExecutionEndDateChange={setExecutionEndDate}
                onCooperationDeptChange={setCooperationDept}
                onAgreementTextChange={setAgreementText}
                writerName={selectedWriter?.user_name ?? '-'}
                writerDeptName={deptMap.get(selectedWriter?.dept_id ?? -1) ?? '-'}
                draftedDate={draftedDate}
                approvalOrder={approvalOrder}
                selectableUsers={selectableUsers}
                deptMap={deptMap}
                onApprovalOrderRoleChange={(lineId, role) =>
                  setApprovalOrder((prev) =>
                    prev.map((line) => (line.id === lineId ? { ...line, role } : line))
                  )
                }
                onApprovalOrderAssigneeChange={(lineId, userId) =>
                  setApprovalOrder((prev) =>
                    prev.map((line) => (line.id === lineId ? { ...line, userId } : line))
                  )
                }
                onApprovalOrderAdd={() =>
                  setApprovalOrder((prev) => [
                    ...prev,
                    { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, role: 'approver', userId: '' },
                  ])
                }
                onApprovalOrderRemove={(lineId) =>
                  setApprovalOrder((prev) => {
                    const next = prev.filter((line) => line.id !== lineId)
                    if (next.length > 0) return next
                    return [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, role: 'approver', userId: '' }]
                  })
                }
                onApprovalOrderMove={(draggedId, targetId) =>
                  setApprovalOrder((prev) => {
                    const draggedIndex = prev.findIndex((line) => line.id === draggedId)
                    const targetIndex = prev.findIndex((line) => line.id === targetId)
                    if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) return prev
                    const next = [...prev]
                    const [dragged] = next.splice(draggedIndex, 1)
                    next.splice(targetIndex, 0, dragged)
                    return next
                  })
                }
              />
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-3 py-3 sm:px-6 sm:py-4">
            <button
              type="button"
              onClick={() => {
                onOpenChange(false)
              }}
              disabled={isSaving}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-700 disabled:opacity-50 sm:px-4"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isLoading || isSaving || !writerHasApprovalRight}
              className="rounded-lg border-2 border-black bg-blue-600 px-3 py-2 text-sm font-black text-white disabled:opacity-50 sm:px-4"
            >
              {isSaving ? '상신 중...' : '작성 후 상신'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
