'use client'

import type { FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import ApprovalDraftPaper from '@/components/approvals/ApprovalDraftPaper'
import ApprovalDraftLoadDialog from '@/components/approvals/ApprovalDraftLoadDialog'
import ApprovalProcessHistoryPanel from '@/components/approvals/ApprovalProcessHistoryPanel'
import { DraftFormErrorBanner, DraftFormWarningBanner } from '@/components/approvals/DraftFormAlertBanners'
import SearchableCombobox from '@/components/SearchableCombobox'
import { useOutboundRequestDraftForm } from '@/components/outbound/useOutboundRequestDraftForm'
import { listOutboundWebDrafts, WEB_OUTBOUND_DRAFT_REMARKS } from '@/lib/outbound-request-draft'

const OUTBOUND_DOC_TYPE_OPTIONS = [{ value: 'outbound_request', label: '출고요청' }]
const AUTOSAVE_KEY = 'approval-outbound-request-draft-v3'

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
  router.push('/outbound-requests')
  router.refresh()
}

function NewOutboundPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loadDialogOpen, setLoadDialogOpen] = useState(false)
  const initialResubmitDocId = useMemo(() => {
    const raw = searchParams.get('resubmit')
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
  }, [searchParams])
  const autosaveKey =
    initialResubmitDocId != null ? `outbound-resubmit-${initialResubmitDocId}` : AUTOSAVE_KEY

  const {
    isLoading,
    isSaving,
    isDraftSaving,
    isDraftDeleting,
    errorMessage,
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
    writerDeptName,
    warehouseId,
    setWarehouseId,
    warehouses,
    selectedItems,
    setSelectedItems,
    itemSearchKeyword,
    setItemSearchKeyword,
    itemOptions,
    addItemRow,
    removeItemRow,
    submitForApproval,
    saveDraftNow,
    deleteDraftDocument,
    loadServerDraftById,
    reloadFromLocalStorage,
    writerId,
    hasDraftContent,
    lastLocalSaveAt,
    lastServerSaveAt,
    allowLeavingWithoutBeforeUnloadPrompt,
    resubmitDocId,
    resubmitHistories,
    isResubmitHydrating,
  } = useOutboundRequestDraftForm({
    autosaveKey,
    enableServerDraft: initialResubmitDocId == null,
    webDraftRemarksTag: WEB_OUTBOUND_DRAFT_REMARKS,
    initialResubmitDocId,
  })
  const isResubmitMode = initialResubmitDocId != null

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

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    if (!form.checkValidity()) {
      form.reportValidity()
      return
    }
    const r = await submitForApproval()
    if (!r.ok) {
      return
    }
    toast.success('출고요청을 상신했습니다.')
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
    const msg = resubmitDocId
      ? '이 문서를 삭제합니다. 복구할 수 없습니다. 계속할까요?'
      : '작성 중인 내용과 임시저장을 모두 삭제할까요?'
    if (!confirm(msg)) return
    const r = await deleteDraftDocument()
    if (r.ok) {
      toast.success('삭제했습니다.')
      if (resubmitDocId && typeof window !== 'undefined' && window.opener && !window.opener.closed) {
        try {
          window.opener.location.reload()
        } catch {
          /* ignore */
        }
        window.close()
      }
    }
  }

  if (isLoading || isResubmitHydrating) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm font-bold text-gray-500">
        로딩 중…
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      {!isResubmitMode && (
        <ApprovalDraftLoadDialog
          open={loadDialogOpen}
          onOpenChange={setLoadDialogOpen}
          writerId={writerId || null}
          remarksTag={WEB_OUTBOUND_DRAFT_REMARKS}
          listServerDrafts={(c, w, t) => listOutboundWebDrafts(c as any, w, t)}
          onLoadServerDraft={loadServerDraftById}
          onReloadLocal={reloadFromLocalStorage}
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <DraftFormErrorBanner message={errorMessage} />
        {isResubmitMode && resubmitDocId != null && (
          <DraftFormWarningBanner>
            회수·반려된 출고 문서를 불러왔습니다. 내용을 수정한 뒤 재상신하거나 삭제할 수 있습니다.
          </DraftFormWarningBanner>
        )}
        {!writerHasApprovalRight ? (
          <DraftFormWarningBanner>
            작성자에게 결재권이 없어 저장·상신할 수 없습니다. 관리자에게 결재권 부여를 요청하세요.
          </DraftFormWarningBanner>
        ) : null}
        {warehouses.length === 0 ? (
          <DraftFormWarningBanner>
            선택 가능한 창고가 없습니다. 창고 권한을 확인하거나 관리자에게 문의하세요.
          </DraftFormWarningBanner>
        ) : null}

        <ApprovalDraftPaper
          docType="outbound_request"
          docTypeOptions={OUTBOUND_DOC_TYPE_OPTIONS}
          onDocTypeChange={() => {}}
          docTypeSelectDisabled
          paperTitle="출고 요청 기안"
          paperSubtitle="출고 창고·품목·수량을 지정하고 결재선을 구성한 뒤 상신합니다."
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
          writerName={selectedWriter?.user_name ?? '—'}
          writerEmployeeNo={selectedWriter?.employee_no ?? null}
          writerDeptName={writerDeptName}
          draftedDate={draftedDate}
          documentNumberHint="(저장·상신 시 DRO-YYMMDD-HHMM 자동 부여)"
          approvalOrder={approvalOrder}
          selectableUsers={selectableUsers}
          resolveLineUser={(userId) => users.find((u) => u.id === userId)}
          deptMap={deptMap}
          onApprovalOrderRoleChange={(lineId, role) =>
            setApprovalOrder((prev) => prev.map((line) => (line.id === lineId ? { ...line, role } : line)))
          }
          onApprovalOrderAssigneeChange={(lineId, userId) =>
            setApprovalOrder((prev) => prev.map((line) => (line.id === lineId ? { ...line, userId } : line)))
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
          postBodyGridSlot={
            <div className="space-y-5">
              <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[5.5rem_1fr] sm:items-center">
                <span className="pt-2 text-xs font-black text-gray-600 sm:pt-0">출고창고</span>
                <SearchableCombobox
                  value={warehouseId}
                  onChange={setWarehouseId}
                  options={warehouses.map((wh) => ({
                    value: String(wh.id),
                    label: wh.name,
                    keywords: [wh.name],
                  }))}
                  placeholder="창고 선택"
                  showClearOption={false}
                  dropdownPlacement="auto"
                />
              </div>
              <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[5.5rem_1fr]">
                <span className="text-xs font-black text-gray-600 sm:pt-2">출고품목</span>
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={itemSearchKeyword}
                      onChange={(e) => setItemSearchKeyword(e.target.value)}
                      placeholder="코드·명 검색"
                      className="min-w-[12rem] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black"
                    />
                    <button
                      type="button"
                      onClick={addItemRow}
                      className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-black text-gray-800 hover:bg-gray-50"
                    >
                      + 행 추가
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full min-w-[280px] text-left text-sm">
                      <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-3 py-2 font-black">품목</th>
                          <th className="w-24 px-2 py-2 text-center font-black">수량</th>
                          <th className="w-10 px-1 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {selectedItems.map((si, idx) => (
                          <tr key={idx}>
                            <td className="px-2 py-2">
                              <SearchableCombobox
                                value={String(si.item_id || '')}
                                onChange={(next) => {
                                  const nextArr = [...selectedItems]
                                  nextArr[idx] = { ...nextArr[idx], item_id: next }
                                  setSelectedItems(nextArr)
                                }}
                                options={itemOptions}
                                placeholder="품목 선택"
                                showClearOption={false}
                                dropdownPlacement="auto"
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                min={1}
                                className="w-full rounded border border-gray-300 px-2 py-1.5 text-center text-sm outline-none focus:border-black"
                                value={si.quantity}
                                onChange={(e) => {
                                  const nextArr = [...selectedItems]
                                  nextArr[idx] = {
                                    ...nextArr[idx],
                                    quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                                  }
                                  setSelectedItems(nextArr)
                                }}
                              />
                            </td>
                            <td className="px-1 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => removeItemRow(idx)}
                                className="text-sm font-black text-gray-400 hover:text-red-600"
                                aria-label="행 삭제"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          }
          processHistorySlot={
            isResubmitMode && resubmitHistories.length > 0 ? (
              <ApprovalProcessHistoryPanel
                rows={resubmitHistories.map((row) => ({
                  ...row,
                  actor_name: users.find((u) => u.id === row.actor_id)?.user_name ?? null,
                }))}
              />
            ) : undefined
          }
        />

        <div className="space-y-2 border-t border-gray-200 pt-4">
          <div className="text-[11px] font-bold text-gray-500">
            {lastLocalSaveAt ? (
              <span>로컬 저장: {formatSaveAt(lastLocalSaveAt) ?? lastLocalSaveAt}</span>
            ) : (
              <span className="text-gray-400">로컬 저장 시각: —</span>
            )}
            {!isResubmitMode && lastServerSaveAt ? (
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
              {!isResubmitMode && (
                <button
                  type="button"
                  onClick={() => setLoadDialogOpen(true)}
                  className="rounded-lg border border-gray-400 bg-white px-4 py-2 text-sm font-bold text-gray-800 hover:bg-gray-50"
                >
                  임시저장 불러오기
                </button>
              )}
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
                href="/outbound-requests"
                onClick={handleListClick}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700"
              >
                목록
              </Link>
              <button
                type="submit"
                disabled={isSaving || !writerHasApprovalRight || warehouses.length === 0}
                className="rounded-lg border-2 border-black bg-blue-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50"
              >
                {isSaving ? '처리 중…' : isResubmitMode ? '재상신' : '작성 후 상신'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}

export default function NewOutboundPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm font-bold text-gray-500">로딩 중…</div>
      }
    >
      <NewOutboundPageInner />
    </Suspense>
  )
}
