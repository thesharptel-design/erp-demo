'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatWriterDepartmentLabel } from '@/lib/approval-draft'
import { canWriterDeleteApprovalDoc } from '@/lib/approval-status'
import { normalizeApprovalRole, type ApprovalRole } from '@/lib/approval-roles'
import { isSystemAdminUser, type CurrentUserPermissions } from '@/lib/permissions'
import { buildApprovalLines, buildApprovalParticipantsRows, normalizeParticipants } from '@/lib/approval-participants'
import { executionDateForDb, isCompleteValidExecutionDate } from '@/lib/execution-date-input'
import ExecutionDateHybridInput from '@/components/approvals/ExecutionDateHybridInput'
import SearchableCombobox, { type ComboboxOption } from '@/components/SearchableCombobox'
import ApprovalLineDnD from '@/components/approvals/ApprovalLineDnD'
import type { ApprovalOrderItem } from '@/components/approvals/ApprovalDraftPaper'
import { useSingleSubmit } from '@/hooks/useSingleSubmit'

type ApprovalDoc = {
  id: number
  doc_no: string
  doc_type: string
  title: string
  content: string | null
  execution_start_date: string | null
  execution_end_date: string | null
  cooperation_dept: string | null
  agreement_text: string | null
  status: string
  current_line_no: number | null
  remarks: string | null
  writer_id: string
  dept_id: number | null
}

type AppUser = {
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
  can_manage_permissions?: boolean | null
  can_admin_manage?: boolean | null
}

type Department = {
  id: number
  dept_name: string
}

type ApprovalLine = {
  id: number
  approval_doc_id: number
  line_no: number
  approver_id: string
  approver_role: string
  status: string
}

type SupabaseErrorLike = {
  code?: string
  message: string
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

function getApprovalEditErrorMessage(error: SupabaseErrorLike) {
  const message = error.message.toLowerCase()

  if (error.message.includes('결재권')) {
    return '결재권이 없는 사용자는 기안/결재선에 지정할 수 없습니다.'
  }

  if (error.code === '23505') {
    return '중복된 값이 있습니다. 입력 내용을 다시 확인하십시오.'
  }

  if (error.code === '23502') {
    return '필수 입력값이 누락되었습니다. 입력 내용을 확인하십시오.'
  }

  if (message.includes('row-level security') || message.includes('permission denied')) {
    return '수정 권한이 없습니다. 관리자에게 문의하십시오.'
  }

  if (message.includes('network') || message.includes('fetch')) {
    return '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
  }

  return '기안서 수정 중 오류가 발생했습니다. 다시 시도해 주세요.'
}

export default function EditApprovalPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const router = useRouter()
  const { isSubmitting: isMutating, run: runSingleSubmit } = useSingleSubmit()

  const [docId, setDocId] = useState<number | null>(null)
  const [docNo, setDocNo] = useState('')
  const [docType, setDocType] = useState('purchase_request')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [executionStartDate, setExecutionStartDate] = useState('')
  const [executionEndDate, setExecutionEndDate] = useState('')
  const [cooperationDept, setCooperationDept] = useState('')
  const [agreementText, setAgreementText] = useState('')
  const [writerId, setWriterId] = useState('')
  const [approvalOrder, setApprovalOrder] = useState<ApprovalOrderItem[]>([
    { id: 'initial-approver', role: 'approver', userId: '' },
  ])
  const [docStatus, setDocStatus] = useState('draft')
  const [docRemarks, setDocRemarks] = useState<string | null>(null)
  const [isCurrentWriter, setIsCurrentWriter] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const [users, setUsers] = useState<AppUser[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const docTypeOptions: ComboboxOption[] = [
    { value: 'purchase_request', label: '구매품의' },
    { value: 'draft_doc', label: '일반기안' },
    { value: 'leave_request', label: '휴가신청' },
  ]
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const contentTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [uploadErrorMessage, setUploadErrorMessage] = useState('')
  const previewBlocks = useMemo(() => buildContentPreviewBlocks(content), [content])

  function getCurrentSelection() {
    const textarea = contentTextareaRef.current
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
    const textarea = contentTextareaRef.current
    if (!textarea) {
      setContent((prev) => `${prev}${text}`)
      return
    }
    const start = selection?.start ?? textarea.selectionStart ?? textarea.value.length
    const end = selection?.end ?? textarea.selectionEnd ?? start
    const currentValue = textarea.value
    const nextValue = `${currentValue.slice(0, start)}${text}${currentValue.slice(end)}`
    const nextCursorPos = start + text.length
    setContent(nextValue)
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
    if (!canEdit) return
    const imageFile = getImageFileFromList(event.clipboardData?.files ?? null)
    if (!imageFile) return
    event.preventDefault()
    const selection = getCurrentSelection()
    void uploadImageAndInsert(imageFile, selection)
  }

  function handleContentDrop(event: React.DragEvent<HTMLTextAreaElement>) {
    if (!canEdit) return
    const imageFile = getImageFileFromList(event.dataTransfer?.files ?? null)
    if (!imageFile) return
    event.preventDefault()
    const selection = getCurrentSelection()
    void uploadImageAndInsert(imageFile, selection)
  }

  useEffect(() => {
    async function loadData() {
      const resolvedParams = await params
      const id = Number(resolvedParams.id)

      if (Number.isNaN(id)) {
        setErrorMessage('잘못된 기안서 경로입니다.')
        setIsLoading(false)
        return
      }

      const [
        { data: doc, error: docError },
        { data: lines, error: linesError },
        { data: usersData, error: usersError },
        { data: deptData, error: deptError },
        { data: sessionData },
        { data: participantRows },
      ] = await Promise.all([
        supabase.from('approval_docs').select('*').eq('id', id).single(),
        supabase
          .from('approval_lines')
          .select('*')
          .eq('approval_doc_id', id)
          .order('line_no'),
        supabase
          .from('app_users')
          .select(
            'id, login_id, user_name, dept_id, department, user_kind, training_program, school_name, teacher_subject, role_name, can_approval_participate, can_manage_permissions, can_admin_manage'
          )
          .order('user_name'),
        supabase.from('departments').select('id, dept_name').order('id'),
        supabase.auth.getUser(),
        supabase.from('approval_participants').select('user_id, role, line_no').eq('approval_doc_id', id).order('line_no'),
      ])

      if (docError || !doc) {
        setErrorMessage('기안서 정보를 불러오지 못했습니다.')
        setIsLoading(false)
        return
      }

      if (linesError || !lines) {
        setErrorMessage('결재선 정보를 불러오지 못했습니다.')
        setIsLoading(false)
        return
      }

      if (usersError) {
        setErrorMessage('사용자 정보를 불러오지 못했습니다.')
        setIsLoading(false)
        return
      }

      if (deptError) {
        setErrorMessage('부서 정보를 불러오지 못했습니다.')
        setIsLoading(false)
        return
      }

      const typedDoc = doc as ApprovalDoc
      const typedLines = lines as ApprovalLine[]
      const currentUserId = sessionData.user?.id
      const currentUser = (usersData as AppUser[] | null)?.find((u) => u.id === currentUserId)
      const isAdmin = isSystemAdminUser(
        currentUser as Pick<CurrentUserPermissions, 'role_name' | 'can_manage_permissions' | 'can_admin_manage'> | null
      )
      const isWriter = typedDoc.writer_id === currentUserId
      const isLineApprover = typedLines.some((line) => line.approver_id === currentUserId)
      const isParticipant = (participantRows || []).some((row: any) => row.user_id === currentUserId)
      if (!isAdmin && !isWriter && !isLineApprover && !isParticipant) {
        setErrorMessage('문서 수정 권한이 없습니다.')
        setIsLoading(false)
        return
      }

      setDocId(typedDoc.id)
      setDocNo(typedDoc.doc_no)
      setDocType(typedDoc.doc_type)
      setTitle(typedDoc.title)
      setContent(typedDoc.content ?? '')
      setExecutionStartDate(typedDoc.execution_start_date ?? '')
      setExecutionEndDate(typedDoc.execution_end_date ?? '')
      setCooperationDept(typedDoc.cooperation_dept ?? '')
      setAgreementText(typedDoc.agreement_text ?? '')
      setWriterId(typedDoc.writer_id)
      setDocStatus(typedDoc.status)
      setDocRemarks(typedDoc.remarks ?? null)
      setIsCurrentWriter(Boolean(currentUserId && typedDoc.writer_id === currentUserId))

      const initialOrderFromParticipants: ApprovalOrderItem[] = (participantRows || [])
        .map((participant, index) => {
          const row = participant as { role: string; user_id: string }
          const role = normalizeApprovalRole(row.role)
          if (!role) return null
          return {
            id: `participant-${index}-${Date.now()}`,
            role,
            userId: row.user_id,
          }
        })
        .filter((row): row is ApprovalOrderItem => row !== null)

      const fallbackOrderFromLines: ApprovalOrderItem[] = typedLines
        .map((line, index) => {
          const role = normalizeApprovalRole(line.approver_role)
          if (!role) return null
          return {
            id: `line-${index}-${Date.now()}`,
            role,
            userId: line.approver_id,
          }
        })
        .filter((row): row is ApprovalOrderItem => row !== null)

      setApprovalOrder(
        initialOrderFromParticipants.length > 0
          ? initialOrderFromParticipants
          : fallbackOrderFromLines.length > 0
            ? fallbackOrderFromLines
            : [{ id: `default-${Date.now()}`, role: 'approver', userId: '' }]
      )

      setUsers((usersData as AppUser[]) ?? [])
      setDepartments((deptData as Department[]) ?? [])
      setIsLoading(false)
    }

    loadData()
  }, [params])

  const deptMap = useMemo(
    () => new Map(departments.map((dept) => [dept.id, dept.dept_name])),
    [departments]
  )

  const selectedWriter = users.find((u) => u.id === writerId)
  const writerHasApprovalRight = selectedWriter?.can_approval_participate === true
  const selectableUsers = users.filter((user) => user.id !== writerId)

  // draft / rejected 만 수정 가능
  const canEdit = ['draft', 'rejected'].includes(docStatus)
  const canWriterDelete =
    isCurrentWriter &&
    canWriterDeleteApprovalDoc({ status: docStatus, remarks: docRemarks })

  async function handleWriterDelete() {
    if (!docId || !canWriterDelete) return
    if (
      !confirm(
        '이 기안서를 완전히 삭제합니다. 연결된 출고 요청·결재선·이력도 함께 삭제되며 복구할 수 없습니다. 계속하시겠습니까?'
      )
    ) {
      return
    }
    await runSingleSubmit(async () => {
      setIsDeleting(true)
      setErrorMessage('')
      const { error } = await supabase.from('approval_docs').delete().eq('id', docId)
      setIsDeleting(false)
      if (error) {
        setErrorMessage(getApprovalEditErrorMessage(error))
        return
      }
      const listHref = docType === 'outbound_request' ? '/outbound-requests' : '/approvals'
      try {
        if (typeof window !== 'undefined' && window.opener && !window.opener.closed) {
          window.opener.location.reload()
        }
      } catch {
        /* ignore */
      }
      router.push(listHref)
      router.refresh()
    })
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (canEdit) {
      const form = e.currentTarget
      if (!form.checkValidity()) {
        form.reportValidity()
        return
      }
    }

    setErrorMessage('')
    setSuccessMessage('')

    if (!docId) {
      setErrorMessage('기안서 정보가 올바르지 않습니다.')
      return
    }

    if (!canEdit) {
      setErrorMessage('임시저장 또는 반려 상태 문서만 수정할 수 있습니다.')
      return
    }

    if (!title.trim()) {
      setErrorMessage('제목을 입력하십시오.')
      return
    }

    if (!content.trim()) {
      setErrorMessage('내용을 입력하십시오.')
      return
    }

    if (!isCompleteValidExecutionDate(executionStartDate) || !isCompleteValidExecutionDate(executionEndDate)) {
      setErrorMessage('시행 시작일·종료일을 모두 입력하십시오.')
      return
    }

    if (!writerId) {
      setErrorMessage('작성자를 선택하십시오.')
      return
    }

    if (!writerHasApprovalRight) {
      setErrorMessage('작성자는 결재권이 있어야 상신/수정이 가능합니다.')
      return
    }

    if (!approvalOrder.some((line) => line.role === 'approver' && line.userId.trim())) {
      setErrorMessage('결재자를 선택하십시오.')
      return
    }

    const startIso = executionDateForDb(executionStartDate)
    const endIso = executionDateForDb(executionEndDate)
    if (startIso && endIso && endIso < startIso) {
      setErrorMessage('시행 종료일은 시작일 이후여야 합니다.')
      return
    }

    await runSingleSubmit(async () => {
      setIsSaving(true)

      const { error: docError } = await supabase
        .from('approval_docs')
        .update({
          doc_type: docType,
          title: title.trim(),
          content: content.trim(),
          execution_start_date: startIso,
          execution_end_date: endIso,
          cooperation_dept: cooperationDept.trim() || null,
          agreement_text: agreementText.trim() || null,
          writer_id: writerId,
          dept_id: selectedWriter?.dept_id ?? null,
          remarks: '웹 수정 문서',
        })
        .eq('id', docId)

      if (docError) {
        setIsSaving(false)
        setErrorMessage(getApprovalEditErrorMessage(docError))
        return
      }

      const participants = normalizeParticipants(
        approvalOrder.map((line) => ({ role: line.role, userId: line.userId }))
      )
      const lines = buildApprovalLines(docId, participants)
      const participantRows = buildApprovalParticipantsRows(docId, participants)

      const { error: deleteLinesError } = await supabase.from('approval_lines').delete().eq('approval_doc_id', docId)
      if (deleteLinesError) {
        setIsSaving(false)
        setErrorMessage(getApprovalEditErrorMessage(deleteLinesError))
        return
      }
      if (lines.length > 0) {
        const { error: insertLinesError } = await supabase.from('approval_lines').insert(lines)
        if (insertLinesError) {
          setIsSaving(false)
          setErrorMessage(getApprovalEditErrorMessage(insertLinesError))
          return
        }
      }

      const { error: deleteParticipantsError } = await supabase
        .from('approval_participants')
        .delete()
        .eq('approval_doc_id', docId)
      if (deleteParticipantsError) {
        setIsSaving(false)
        setErrorMessage(getApprovalEditErrorMessage(deleteParticipantsError))
        return
      }
      if (participantRows.length > 0) {
        const { error: participantError } = await supabase.from('approval_participants').insert(participantRows)
        if (participantError) {
          setIsSaving(false)
          setErrorMessage(getApprovalEditErrorMessage(participantError))
          return
        }
      }

      setIsSaving(false)
      setSuccessMessage('기안서 정보가 저장되었습니다.')
      router.refresh()
    })
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-white p-8 shadow">
        <p className="text-gray-500">기안서 정보를 불러오는 중입니다...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/approvals/${docId}`}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← 기안서 상세로
          </Link>
          <h1 className="mt-2 text-3xl font-bold">기안서 수정</h1>
          <p className="mt-1 text-gray-600">
            기안 문서와 결재선을 수정합니다.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-6 shadow">
        <div className="mb-6 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
          문서번호: <span className="font-medium">{docNo}</span> / 상태:{' '}
          <span className="font-medium">{docStatus}</span>
          {!canEdit && (
            <span className="ml-2 text-red-600">
              (임시저장 또는 반려 상태 문서만 수정할 수 있습니다)
            </span>
          )}
        </div>
        {!writerHasApprovalRight && (
          <div className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 font-bold border border-amber-200">
            작성자에게 결재권이 없어 상신/수정을 진행할 수 없습니다. 관리자에게 결재권 부여를 요청하세요.
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              문서유형
            </label>
            <SearchableCombobox
              value={docType}
              onChange={setDocType}
              disabled={!canEdit}
              options={docTypeOptions}
              placeholder="문서유형"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              작성자
            </label>
            <SearchableCombobox
              value={writerId}
              onChange={setWriterId}
              disabled={!canEdit}
              options={users.map((user) => {
                const deptLabel = formatWriterDepartmentLabel(user, deptMap)
                return {
                  value: user.id,
                  label: `${user.user_name} / ${deptLabel} / ${user.role_name}${user.can_approval_participate ? '' : ' [결재권 없음]'}`,
                  keywords: [user.user_name, user.login_id, user.role_name, deptLabel],
                  disabled: !user.can_approval_participate,
                }
              })}
              placeholder="작성자 선택"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-gray-700">시행일자</label>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <ExecutionDateHybridInput
                value={executionStartDate}
                onChange={setExecutionStartDate}
                disabled={!canEdit}
                placeholder="시작일 (YYYYMMDD)"
                calendarLabel="시작일 달력"
                inputClassName="w-full min-w-0 flex-1 rounded-xl border border-gray-300 px-4 py-3 font-bold tracking-wide outline-none focus:border-black disabled:bg-gray-100"
                buttonClassName="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="text-sm font-bold text-gray-500">~</span>
              <ExecutionDateHybridInput
                value={executionEndDate}
                onChange={setExecutionEndDate}
                disabled={!canEdit}
                placeholder="종료일 (YYYYMMDD)"
                calendarLabel="종료일 달력"
                inputClassName="w-full min-w-0 flex-1 rounded-xl border border-gray-300 px-4 py-3 font-bold tracking-wide outline-none focus:border-black disabled:bg-gray-100"
                buttonClassName="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              협조부서
            </label>
            <input
              value={cooperationDept}
              onChange={(e) => setCooperationDept(e.target.value)}
              disabled={!canEdit}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black disabled:bg-gray-100"
              placeholder="협조 부서"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              합의
            </label>
            <input
              value={agreementText}
              onChange={(e) => setAgreementText(e.target.value)}
              disabled={!canEdit}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black disabled:bg-gray-100"
              placeholder="합의 내용"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              제목
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canEdit}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black disabled:bg-gray-100"
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              내용
            </label>
            <textarea
              ref={contentTextareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onPaste={handleContentPaste}
              onDrop={handleContentDrop}
              onDragOver={(event) => {
                if (canEdit) event.preventDefault()
              }}
              rows={8}
              disabled={!canEdit}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black disabled:bg-gray-100"
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

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-gray-700">결재 라인</label>
            <div className={`${canEdit ? '' : 'pointer-events-none opacity-70'}`}>
              <ApprovalLineDnD
                lines={approvalOrder}
                users={selectableUsers}
                deptMap={deptMap}
                onLineRoleChange={(lineId, role) =>
                  setApprovalOrder((prev) =>
                    prev.map((line) => (line.id === lineId ? { ...line, role: role as ApprovalRole } : line))
                  )
                }
                onLineAssigneeChange={(lineId, userId) =>
                  setApprovalOrder((prev) =>
                    prev.map((line) => (line.id === lineId ? { ...line, userId } : line))
                  )
                }
                onLineAdd={() =>
                  setApprovalOrder((prev) => [
                    ...prev,
                    { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, role: 'approver', userId: '' },
                  ])
                }
                onLineRemove={(lineId) =>
                  setApprovalOrder((prev) => {
                    const next = prev.filter((line) => line.id !== lineId)
                    if (next.length > 0) return next
                    return [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, role: 'approver', userId: '' }]
                  })
                }
                onLineMove={(draggedId, targetId) =>
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
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
            {successMessage}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isSaving || isMutating || !canEdit || !writerHasApprovalRight}
            className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isSaving ? '저장 중...' : '저장'}
          </button>

          <Link
            href={`/approvals/${docId}`}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
          >
            상세로
          </Link>

          {canWriterDelete && (
            <button
              type="button"
              onClick={() => void handleWriterDelete()}
              disabled={isDeleting || isSaving || isMutating}
              className="rounded-xl border-2 border-red-700 bg-red-50 px-4 py-2 text-sm font-bold text-red-800 hover:bg-red-100 disabled:opacity-50"
            >
              {isDeleting ? '삭제 중…' : '문서 삭제'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}