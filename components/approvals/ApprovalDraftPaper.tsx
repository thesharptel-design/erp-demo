'use client'

import { useRef, useState } from 'react'
import SearchableCombobox, { type ComboboxOption } from '@/components/SearchableCombobox'
import type { ApprovalRole } from '@/lib/approval-roles'
import ApprovalLineDnD from '@/components/approvals/ApprovalLineDnD'
import { supabase } from '@/lib/supabase'

export type ApprovalDraftAppUser = {
  id: string
  login_id: string
  user_name: string
  dept_id: number | null
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
  cooperationDept: string
  agreementText: string
  onExecutionStartDateChange: (value: string) => void
  onExecutionEndDateChange: (value: string) => void
  onCooperationDeptChange: (value: string) => void
  onAgreementTextChange: (value: string) => void
  writerName: string
  writerDeptName: string
  draftedDate: string
  approvalOrder: ApprovalOrderItem[]
  selectableUsers: ApprovalDraftAppUser[]
  deptMap: Map<number, string>
  onApprovalOrderRoleChange: (lineId: string, role: ApprovalRole) => void
  onApprovalOrderAssigneeChange: (lineId: string, userId: string) => void
  onApprovalOrderAdd: () => void
  onApprovalOrderRemove: (lineId: string) => void
  onApprovalOrderMove: (draggedId: string, targetId: string) => void
}

type ContentPreviewBlock =
  | { type: 'text'; value: string }
  | { type: 'image'; value: string }

function isImageUrl(url: string): boolean {
  return (
    /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(url) ||
    url.includes('/storage/v1/object/public/approval_attachments/')
  )
}

function buildContentPreviewBlocks(raw: string): ContentPreviewBlock[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => (isImageUrl(line) ? { type: 'image', value: line } : { type: 'text', value: line }))
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
  cooperationDept,
  agreementText,
  onExecutionStartDateChange,
  onExecutionEndDateChange,
  onCooperationDeptChange,
  onAgreementTextChange,
  writerName,
  writerDeptName,
  draftedDate,
  approvalOrder,
  selectableUsers,
  deptMap,
  onApprovalOrderRoleChange,
  onApprovalOrderAssigneeChange,
  onApprovalOrderAdd,
  onApprovalOrderRemove,
  onApprovalOrderMove,
}: ApprovalDraftPaperProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [uploadErrorMessage, setUploadErrorMessage] = useState('')
  const previewBlocks = buildContentPreviewBlocks(content)

  function getCurrentSelection() {
    const textarea = textareaRef.current
    if (!textarea) {
      const fallbackPos = content.length
      return { start: fallbackPos, end: fallbackPos }
    }
    return {
      start: textarea.selectionStart ?? 0,
      end: textarea.selectionEnd ?? 0,
    }
  }

  function insertTextAtSelection(text: string, selection?: { start: number; end: number }) {
    const textarea = textareaRef.current
    if (!textarea) {
      onContentChange(content + text)
      return
    }
    const start = selection?.start ?? textarea.selectionStart ?? textarea.value.length
    const end = selection?.end ?? textarea.selectionEnd ?? start
    const currentValue = textarea.value
    const nextValue = `${currentValue.slice(0, start)}${text}${currentValue.slice(end)}`
    const nextCursorPos = start + text.length
    onContentChange(nextValue)
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(nextCursorPos, nextCursorPos)
    })
  }

  async function uploadImageAndInsert(file: File, selection: { start: number; end: number }) {
    try {
      setUploadErrorMessage('')
      setIsUploadingImage(true)
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('로그인 세션이 만료되어 이미지를 업로드할 수 없습니다.')
      }

      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch('/api/approvals/attachments/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error ?? '이미지 업로드에 실패했습니다.')
      }
      if (!payload?.publicUrl || typeof payload.publicUrl !== 'string') {
        throw new Error('업로드 URL을 확인할 수 없습니다.')
      }
      insertTextAtSelection(`\n${payload.publicUrl}\n`, selection)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '이미지 업로드 중 오류가 발생했습니다.'
      setUploadErrorMessage(message)
    } finally {
      setIsUploadingImage(false)
    }
  }

  function getImageFileFromList(fileList: FileList | null): File | null {
    if (!fileList) return null
    for (const file of Array.from(fileList)) {
      if (file.type.startsWith('image/')) {
        return file
      }
    }
    return null
  }

  function handleContentPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imageFile = getImageFileFromList(event.clipboardData?.files ?? null)
    if (!imageFile) return
    event.preventDefault()
    const selection = getCurrentSelection()
    void uploadImageAndInsert(imageFile, selection)
  }

  function handleContentDrop(event: React.DragEvent<HTMLTextAreaElement>) {
    const imageFile = getImageFileFromList(event.dataTransfer?.files ?? null)
    if (!imageFile) return
    event.preventDefault()
    const selection = getCurrentSelection()
    void uploadImageAndInsert(imageFile, selection)
  }

  return (
    <div className="overflow-x-auto">
      <div className="w-full min-w-0 space-y-4 rounded-xl border-2 border-black bg-white p-3 sm:p-4 md:min-w-[860px]">
        <div className="flex flex-col items-start justify-between gap-4 border-b-2 border-black pb-3 sm:flex-row sm:gap-6">
          <div>
            <h3 className="text-xl font-black tracking-tight text-gray-900 sm:text-2xl">업무기안서</h3>
            <p className="mt-1 text-xs font-bold text-gray-500">문서 작성 후 결재선을 지정해 바로 상신합니다.</p>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 text-[11px] min-[430px]:grid-cols-2 sm:min-w-[300px] sm:w-auto">
            <div className="rounded border border-gray-200 bg-gray-50 p-2">
              <p className="text-[10px] font-black text-gray-500">기안자</p>
              <p className="font-bold text-gray-800">{writerName || '-'}</p>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-2">
              <p className="text-[10px] font-black text-gray-500">소속</p>
              <p className="font-bold text-gray-800">{writerDeptName || '-'}</p>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-2">
              <p className="text-[10px] font-black text-gray-500">기안일</p>
              <p className="font-bold text-gray-800">{draftedDate}</p>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-2">
              <p className="text-[10px] font-black text-gray-500">문서유형</p>
              <SearchableCombobox
                value={docType}
                onChange={onDocTypeChange}
                options={docTypeOptions}
                placeholder="문서 유형"
                showClearOption={false}
              />
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
          <div className="border-b bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">협조부서</div>
          <div className="border-b px-3 py-2">
            <input
              value={cooperationDept}
              onChange={(e) => onCooperationDeptChange(e.target.value)}
              placeholder="협조 부서를 입력하세요"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
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
          <div className="bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">본문</div>
          <div className="px-3 py-2">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => onContentChange(e.target.value)}
              onPaste={handleContentPaste}
              onDrop={handleContentDrop}
              onDragOver={(event) => event.preventDefault()}
              rows={7}
              placeholder="업무기안 내용을 입력하세요"
              className="w-full min-h-[220px] resize-y rounded border border-gray-300 px-3 py-2 text-sm"
              required
            />
            <div className="mt-1 space-y-1">
              <p className="text-[11px] font-bold text-gray-500">
                이미지 붙여넣기(Ctrl+V) 또는 드롭 시 자동 업로드 후 URL이 본문에 삽입됩니다.
              </p>
              {isUploadingImage && (
                <p className="text-[11px] font-bold text-blue-600">이미지 업로드 중...</p>
              )}
              {uploadErrorMessage && (
                <p className="text-[11px] font-bold text-red-600">{uploadErrorMessage}</p>
              )}
            </div>
            {previewBlocks.length > 0 && (
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="mb-2 text-[11px] font-black text-gray-600">본문 미리보기</p>
                <div className="space-y-2">
                  {previewBlocks.map((block, index) =>
                    block.type === 'image' ? (
                      <img
                        key={`${block.value}-${index}`}
                        src={block.value}
                        alt={`본문 이미지 ${index + 1}`}
                        className="max-h-64 w-full rounded border border-gray-200 object-contain bg-white"
                      />
                    ) : (
                      <p
                        key={`${block.value}-${index}`}
                        className="whitespace-pre-wrap break-words text-sm text-gray-700"
                      >
                        {block.value}
                      </p>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
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
