'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import {
  APPROVAL_DRAFT_DOC_TYPE_OPTIONS,
  formatWriterDepartmentLabel,
} from '@/lib/approval-draft'
import ApprovalDraftPaper from '@/components/approvals/ApprovalDraftPaper'
import ApprovalDraftLoadDialog from '@/components/approvals/ApprovalDraftLoadDialog'
import { DraftFormErrorBanner, DraftFormWarningBanner } from '@/components/approvals/DraftFormAlertBanners'
import { useApprovalDraftForm } from '@/components/approvals/useApprovalDraftForm'

const AUTOSAVE_KEY = 'approval-general-draft-v2'

const LEAVE_DRAFT_CONFIRM =
  '작성 중인 내용이 있습니다. 그래도 나가시겠습니까?\n(브라우저 자동 저장은 이미 적용되었을 수 있습니다.)'

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

function closePopupOrNavigate(router: ReturnType<typeof useRouter>) {
  if (typeof window !== 'undefined' && window.opener && !window.opener.closed) {
    try {
      window.opener.location.reload()
    } catch {
      /* ignore */
    }
    window.close()
    return
  }
  router.push('/approvals')
  router.refresh()
}

export default function NewApprovalPage() {
  const router = useRouter()
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
    submitDraft,
    saveDraftNow,
    deleteDraftDocument,
    loadServerDraftById,
    reloadFromLocalStorage,
    writerId,
    hasDraftContent,
    lastLocalSaveAt,
    lastServerSaveAt,
    allowLeavingWithoutBeforeUnloadPrompt,
  } = useApprovalDraftForm({
    remarks: '웹 등록 문서',
    autosaveKey: AUTOSAVE_KEY,
    enableServerDraft: true,
  })

  const handleListClick = useCallback(
    (e: React.MouseEvent) => {
      if (hasDraftContent && typeof window !== 'undefined' && !window.confirm(LEAVE_DRAFT_CONFIRM)) {
        e.preventDefault()
        return
      }
      allowLeavingWithoutBeforeUnloadPrompt()
      if (typeof window !== 'undefined' && window.opener) {
        e.preventDefault()
        closePopupOrNavigate(router)
      }
    },
    [allowLeavingWithoutBeforeUnloadPrompt, hasDraftContent, router]
  )

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    if (!form.checkValidity()) {
      form.reportValidity()
      return
    }
    const ok = await submitDraft()
    if (!ok) return
    allowLeavingWithoutBeforeUnloadPrompt()
    closePopupOrNavigate(router)
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
    if (r.ok) {
      toast.success('삭제했습니다.')
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm font-bold text-gray-500">
        로딩 중…
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <ApprovalDraftLoadDialog
        open={loadDialogOpen}
        onOpenChange={setLoadDialogOpen}
        writerId={writerId || null}
        onLoadServerDraft={loadServerDraftById}
        onReloadLocal={reloadFromLocalStorage}
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        <DraftFormErrorBanner message={errorMessage} />
        {!writerHasApprovalRight && (
          <DraftFormWarningBanner>
            작성자에게 결재권이 없어 상신할 수 없습니다. 관리자에게 결재권 부여를 요청하세요.
          </DraftFormWarningBanner>
        )}

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

        <div className="space-y-2 border-t border-gray-200 pt-4">
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
          <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSaveDraft()}
              disabled={isDraftSaving}
              className="rounded-lg border-2 border-black bg-amber-100 px-4 py-2 text-sm font-black text-gray-900 disabled:opacity-50"
            >
              {isDraftSaving ? '저장 중…' : '임시저장'}
            </button>
            <button
              type="button"
              onClick={() => setLoadDialogOpen(true)}
              className="rounded-lg border border-gray-400 bg-white px-4 py-2 text-sm font-bold text-gray-800 hover:bg-gray-50"
            >
              임시저장 불러오기
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteDraft()}
              disabled={isDraftDeleting}
              className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-black text-red-800 disabled:opacity-50"
            >
              {isDraftDeleting ? '삭제 중…' : '삭제'}
            </button>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Link
              href="/approvals"
              onClick={handleListClick}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700"
            >
              목록
            </Link>
            <button
              type="submit"
              disabled={isSaving || !writerHasApprovalRight}
              className="rounded-lg border-2 border-black bg-blue-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50"
            >
              {isSaving ? '상신 중…' : '작성 후 상신'}
            </button>
          </div>
          </div>
        </div>
      </form>
    </div>
  )
}
