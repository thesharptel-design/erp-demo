'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ApprovalDraftPaper from '@/components/approvals/ApprovalDraftPaper'
import ApprovalDraftLoadDialog from '@/components/approvals/ApprovalDraftLoadDialog'
import {
  DraftFormErrorBanner,
  DraftFormInfoBanner,
  DraftFormWarningBanner,
} from '@/components/approvals/DraftFormAlertBanners'
import {
  APPROVAL_DRAFT_DOC_TYPE_OPTIONS,
  formatWriterDepartmentLabel,
  WEB_MODAL_DRAFT_REMARKS,
} from '@/lib/approval-draft'
import { useApprovalDraftForm } from '@/components/approvals/useApprovalDraftForm'

const LEAVE_DRAFT_CONFIRM =
  '작성 중인 내용이 있습니다. 그래도 닫으시겠습니까?\n(브라우저 자동 저장은 이미 적용되었을 수 있습니다.)'

function formatSaveAt(iso: string | null) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return null
  }
}

type ApprovalDraftModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitted?: () => void
}

export default function ApprovalDraftModal({ open, onOpenChange, onSubmitted }: ApprovalDraftModalProps) {
  const [loadDialogOpen, setLoadDialogOpen] = useState(false)

  const {
    isLoading,
    isSaving,
    isDraftSaving,
    isDraftDeleting,
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
    agreementText,
    setAgreementText,
    approvalOrder,
    setApprovalOrder,
    users,
    selectableUsers,
    deptMap,
    selectedWriter,
    writerHasApprovalRight,
    draftedDate,
    hasDraftContent,
    resetForm,
    submitDraft,
    saveDraftNow,
    deleteDraftDocument,
    loadServerDraftById,
    reloadFromLocalStorage,
    writerId,
    lastLocalSaveAt,
    lastServerSaveAt,
  } = useApprovalDraftForm({
    enabled: open,
    remarks: '문서함 모달 등록 문서',
    autosaveKey: 'approval-draft-modal-autosave-v2',
    enableServerDraft: true,
    webDraftRemarksTag: WEB_MODAL_DRAFT_REMARKS,
  })

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    if (!form.checkValidity()) {
      form.reportValidity()
      return
    }
    const ok = await submitDraft()
    if (!ok) return
    onSubmitted?.()
    resetForm({ clearAutosave: true })
    onOpenChange(false)
    if (typeof window !== 'undefined' && window.opener && !window.opener.closed) {
      try {
        window.opener.location.reload()
      } catch {
        /* ignore */
      }
      window.close()
    }
  }

  const handleSaveDraft = async () => {
    const r = await saveDraftNow()
    if (r.ok) {
      toast.success(r.localOnly ? '브라우저에 임시저장했습니다.' : '임시저장했습니다. (서버·브라우저)')
    }
  }

  const handleDeleteDraft = async () => {
    if (!confirm('작성 중인 내용과 임시저장을 모두 삭제할까요?')) return
    const r = await deleteDraftDocument()
    if (r.ok) toast.success('삭제했습니다.')
  }

  const handleDialogOpenChange = (next: boolean) => {
    if (!next && hasDraftContent && typeof window !== 'undefined' && !window.confirm(LEAVE_DRAFT_CONFIRM)) {
      return
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <ApprovalDraftLoadDialog
        open={loadDialogOpen}
        onOpenChange={setLoadDialogOpen}
        writerId={writerId || null}
        remarksTag={WEB_MODAL_DRAFT_REMARKS}
        onLoadServerDraft={loadServerDraftById}
        onReloadLocal={reloadFromLocalStorage}
      />
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
              <DraftFormInfoBanner>
                입력 내용은 자동으로 임시 저장되며, 창을 닫아도 다음에 복구됩니다.
              </DraftFormInfoBanner>
            )}
            {!isLoading && !writerHasApprovalRight && (
              <DraftFormWarningBanner>
                작성자에게 결재권이 없어 상신할 수 없습니다. 관리자에게 결재권 부여를 요청하세요.
              </DraftFormWarningBanner>
            )}
            <DraftFormErrorBanner message={errorMessage} />

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
                agreementText={agreementText}
                onExecutionStartDateChange={setExecutionStartDate}
                onExecutionEndDateChange={setExecutionEndDate}
                onAgreementTextChange={setAgreementText}
                writerName={selectedWriter?.user_name ?? '-'}
                writerDeptName={formatWriterDepartmentLabel(selectedWriter, deptMap)}
                draftedDate={draftedDate}
                documentNumberHint="(상신 시 자동 부여)"
                approvalOrder={approvalOrder}
                selectableUsers={selectableUsers}
                resolveLineUser={(userId) => users.find((u) => u.id === userId)}
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

          <div className="flex flex-col gap-2 border-t border-gray-200 px-3 py-3 sm:px-6 sm:py-4">
            <div className="text-[11px] font-bold text-gray-500">
              {lastLocalSaveAt ? (
                <span>로컬 저장: {formatSaveAt(lastLocalSaveAt) ?? lastLocalSaveAt}</span>
              ) : (
                <span className="text-gray-400">로컬 저장 시각: —</span>
              )}
              {lastServerSaveAt ? (
                <span className="ml-3">서버 임시저장: {formatSaveAt(lastServerSaveAt) ?? lastServerSaveAt}</span>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleSaveDraft()}
                disabled={isDraftSaving}
                className="rounded-lg border-2 border-black bg-amber-100 px-3 py-2 text-xs font-black text-gray-900 disabled:opacity-50 sm:text-sm"
              >
                {isDraftSaving ? '저장 중…' : '임시저장'}
              </button>
              <button
                type="button"
                onClick={() => setLoadDialogOpen(true)}
                className="rounded-lg border border-gray-400 bg-white px-3 py-2 text-xs font-bold text-gray-800 hover:bg-gray-50 sm:text-sm"
              >
                임시저장 불러오기
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteDraft()}
                disabled={isDraftDeleting}
                className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-black text-red-800 disabled:opacity-50 sm:text-sm"
              >
                {isDraftDeleting ? '삭제 중…' : '삭제'}
              </button>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => handleDialogOpenChange(false)}
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
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
