'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  buildReferenceSummaryForDraft,
  createApprovalDraft,
  deleteWebGeneralDraft,
  deleteWebGeneralDraftWithRetry,
  fetchApprovalResubmitBundle,
  fetchWebGeneralDraftBundle,
  getApprovalCreateErrorMessage,
  syncWebGeneralDraft,
  WEB_GENERAL_DRAFT_REMARKS,
} from '@/lib/approval-draft'
import { toast } from 'sonner'
import type { ApprovalRole } from '@/lib/approval-roles'
import type { ApprovalDraftAppUser, ApprovalOrderItem } from '@/components/approvals/ApprovalDraftPaper'
import { isHtmlContentEffectivelyEmpty } from '@/lib/html-content'
import {
  executionDateForDb,
  executionDateInputDisplay,
  isCompleteValidExecutionDate,
} from '@/lib/execution-date-input'
import { dismissDraftValidationToast, showDraftValidationError } from '@/lib/draft-form-feedback'
import type { ApprovalProcessHistoryRow } from '@/components/approvals/ApprovalProcessHistoryPanel'

type Department = {
  id: number
  dept_name: string
}

export type UseApprovalDraftFormParams = {
  enabled?: boolean
  remarks: string
  autosaveKey?: string
  /** Supabase에 status=draft 문서로 임시저장 */
  enableServerDraft?: boolean
  /** 임시 문서 remarks 구분 (모달·신규 페이지 분리) */
  webDraftRemarksTag?: string
  /** `/approvals/new?resubmit=` — 회수·반려 문서를 작성 폼으로 불러 재상신 */
  initialResubmitDocId?: number | null
}

type ApprovalDraftAutosavePayloadV2 = {
  version: 2
  savedAt: string
  serverDraftDocId: number | null
  docType: string
  title: string
  content: string
  executionStartDate: string
  executionEndDate: string
  agreementText: string
  approvalOrder: ApprovalOrderItem[]
}

function makeEmptyApprovalLine(): ApprovalOrderItem {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, role: 'approver', userId: '' }
}

function participantsToApprovalOrder(
  rows: Array<{ user_id: string; role: string; line_no: number }>
): ApprovalOrderItem[] {
  const sorted = [...rows].sort((a, b) => a.line_no - b.line_no)
  return sorted.map((r) => ({
    id: `srv-${r.line_no}-${r.user_id}`,
    role: (r.role === 'reviewer' || r.role === 'cooperator' || r.role === 'approver' ? r.role : 'approver') as ApprovalRole,
    userId: r.user_id,
  }))
}

export function useApprovalDraftForm({
  enabled = true,
  remarks,
  autosaveKey,
  enableServerDraft = false,
  webDraftRemarksTag = WEB_GENERAL_DRAFT_REMARKS,
  initialResubmitDocId = null,
}: UseApprovalDraftFormParams) {
  const [users, setUsers] = useState<ApprovalDraftAppUser[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDraftSaving, setIsDraftSaving] = useState(false)
  const [isDraftDeleting, setIsDraftDeleting] = useState(false)

  const [docType, setDocType] = useState('draft_doc')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [executionStartDate, setExecutionStartDate] = useState('')
  const [executionEndDate, setExecutionEndDate] = useState('')
  const [agreementText, setAgreementText] = useState('')
  const [writerId, setWriterId] = useState('')
  const [approvalOrder, setApprovalOrder] = useState<ApprovalOrderItem[]>([makeEmptyApprovalLine()])
  const [serverDraftDocId, setServerDraftDocId] = useState<number | null>(null)
  const [resubmitDocId, setResubmitDocId] = useState<number | null>(null)
  const [resubmitHistories, setResubmitHistories] = useState<ApprovalProcessHistoryRow[]>([])
  const [isResubmitHydrating, setIsResubmitHydrating] = useState(
    () => initialResubmitDocId != null && initialResubmitDocId > 0
  )
  const [errorMessage, setErrorMessage] = useState('')
  const [lastLocalSaveAt, setLastLocalSaveAt] = useState<string | null>(null)
  const [lastServerSaveAt, setLastServerSaveAt] = useState<string | null>(null)
  const hasRestoredAutosaveRef = useRef(false)
  const bypassBeforeUnloadRef = useRef(false)

  const allowLeavingWithoutBeforeUnloadPrompt = useCallback(() => {
    bypassBeforeUnloadRef.current = true
  }, [])

  useEffect(() => {
    if (!enabled) return
    let active = true
    setIsLoading(true)

    async function loadData() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const [{ data: usersData }, { data: deptData }] = await Promise.all([
        supabase
          .from('app_users')
          .select(
            'id, login_id, user_name, employee_no, dept_id, department, user_kind, training_program, school_name, teacher_subject, role_name, can_approval_participate'
          )
          .order('user_name'),
        supabase.from('departments').select('id, dept_name').order('id'),
      ])

      if (!active) return
      setUsers((usersData as ApprovalDraftAppUser[]) ?? [])
      setDepartments((deptData as Department[]) ?? [])
      if (user) setWriterId(user.id)
      setIsLoading(false)
    }

    loadData()
    return () => {
      active = false
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    if (initialResubmitDocId == null || initialResubmitDocId <= 0) {
      setResubmitHistories([])
      setIsResubmitHydrating(false)
      return
    }
    if (!writerId || users.length === 0) return

    let cancelled = false
    setIsResubmitHydrating(true)
    ;(async () => {
      dismissDraftValidationToast()
      setErrorMessage('')
      try {
        const { doc, participants } = await fetchApprovalResubmitBundle(
          supabase as any,
          initialResubmitDocId,
          writerId
        )
        if (cancelled) return
        const { data: histRows } = await supabase
          .from('approval_histories')
          .select('id, action_type, actor_id, action_at, action_comment')
          .eq('approval_doc_id', initialResubmitDocId)
          .order('action_at', { ascending: true })
        if (cancelled) return
        setResubmitHistories((histRows as ApprovalProcessHistoryRow[]) ?? [])
        setResubmitDocId(initialResubmitDocId)
        setServerDraftDocId(null)
        setDocType(String(doc.doc_type ?? 'draft_doc'))
        setTitle(String(doc.title ?? ''))
        setContent(String(doc.content ?? ''))
        setExecutionStartDate(executionDateInputDisplay(doc.execution_start_date as string | null | undefined))
        setExecutionEndDate(executionDateInputDisplay(doc.execution_end_date as string | null | undefined))
        setAgreementText(String(doc.agreement_text ?? ''))
        const nextOrder =
          participants.length > 0 ? participantsToApprovalOrder(participants) : [makeEmptyApprovalLine()]
        setApprovalOrder(nextOrder)
        if (autosaveKey && typeof window !== 'undefined') {
          const payload: ApprovalDraftAutosavePayloadV2 = {
            version: 2,
            savedAt: new Date().toISOString(),
            serverDraftDocId: null,
            docType: String(doc.doc_type ?? 'draft_doc'),
            title: String(doc.title ?? ''),
            content: String(doc.content ?? ''),
            executionStartDate: executionDateInputDisplay(doc.execution_start_date as string | null | undefined),
            executionEndDate: executionDateInputDisplay(doc.execution_end_date as string | null | undefined),
            agreementText: String(doc.agreement_text ?? ''),
            approvalOrder: nextOrder,
          }
          localStorage.setItem(autosaveKey, JSON.stringify(payload))
        }
        setLastLocalSaveAt(new Date().toISOString())
        dismissDraftValidationToast()
        setErrorMessage('')
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '불러오기에 실패했습니다.'
        showDraftValidationError(setErrorMessage, msg)
        setResubmitDocId(null)
        setResubmitHistories([])
      } finally {
        if (!cancelled) setIsResubmitHydrating(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [autosaveKey, enabled, initialResubmitDocId, writerId, users.length])

  const deptMap = useMemo(() => new Map(departments.map((d) => [d.id, d.dept_name])), [departments])
  const selectedWriter = users.find((u) => u.id === writerId)
  const writerHasApprovalRight = selectedWriter?.can_approval_participate === true
  const selectableUsers = users.filter((u) => u.id !== writerId)
  const draftedDate = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const hasDraftContent = useMemo(
    () =>
      Boolean(
        title.trim() ||
          content.trim() ||
          executionStartDate ||
          executionEndDate ||
          agreementText.trim() ||
          approvalOrder.some((line) => line.userId.trim())
      ),
    [agreementText, approvalOrder, content, executionEndDate, executionStartDate, title]
  )

  const persistLocalPayload = useCallback(() => {
    if (!autosaveKey || typeof window === 'undefined') return
    const payload: ApprovalDraftAutosavePayloadV2 = {
      version: 2,
      savedAt: new Date().toISOString(),
      serverDraftDocId,
      docType,
      title,
      content,
      executionStartDate,
      executionEndDate,
      agreementText,
      approvalOrder,
    }
    const iso = new Date().toISOString()
    localStorage.setItem(autosaveKey, JSON.stringify(payload))
    setLastLocalSaveAt(iso)
  }, [
    agreementText,
    approvalOrder,
    autosaveKey,
    content,
    docType,
    executionEndDate,
    executionStartDate,
    serverDraftDocId,
    title,
  ])

  const clearSavedDraft = useCallback(() => {
    if (!autosaveKey || typeof window === 'undefined') return
    localStorage.removeItem(autosaveKey)
  }, [autosaveKey])

  const applyPayloadToState = useCallback((parsed: Partial<ApprovalDraftAutosavePayloadV2>) => {
    if (parsed.docType) setDocType(parsed.docType)
    if (typeof parsed.title === 'string') setTitle(parsed.title)
    if (typeof parsed.content === 'string') setContent(parsed.content)
    if (typeof parsed.executionStartDate === 'string') setExecutionStartDate(parsed.executionStartDate)
    if (typeof parsed.executionEndDate === 'string') setExecutionEndDate(parsed.executionEndDate)
    if (typeof parsed.agreementText === 'string') setAgreementText(parsed.agreementText)
    if ('serverDraftDocId' in parsed && (typeof parsed.serverDraftDocId === 'number' || parsed.serverDraftDocId === null)) {
      setServerDraftDocId(parsed.serverDraftDocId)
    }
    if (Array.isArray(parsed.approvalOrder) && parsed.approvalOrder.length > 0) {
      const normalizedOrder = parsed.approvalOrder
        .map((line) => ({
          id: String(line.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
          role:
            line.role === 'reviewer' || line.role === 'cooperator' || line.role === 'approver'
              ? line.role
              : 'approver',
          userId: String(line.userId || ''),
        }))
        .filter((line) => line.role)
      setApprovalOrder(normalizedOrder.length > 0 ? normalizedOrder : [makeEmptyApprovalLine()])
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    if (!autosaveKey || typeof window === 'undefined') {
      hasRestoredAutosaveRef.current = true
      return
    }

    const raw = localStorage.getItem(autosaveKey)
    if (!raw) {
      hasRestoredAutosaveRef.current = true
      return
    }

    try {
      const parsed = JSON.parse(raw) as Partial<ApprovalDraftAutosavePayloadV2> & { version?: number }
      if (parsed.version === 2) {
        applyPayloadToState(parsed)
        if (typeof parsed.savedAt === 'string') setLastLocalSaveAt(parsed.savedAt)
      } else {
        const legacy = parsed as Record<string, unknown>
        if (typeof legacy.docType === 'string') setDocType(legacy.docType as string)
        if (typeof legacy.title === 'string') setTitle(legacy.title)
        if (typeof legacy.content === 'string') setContent(legacy.content)
        if (typeof legacy.executionStartDate === 'string') setExecutionStartDate(legacy.executionStartDate)
        if (typeof legacy.executionEndDate === 'string') setExecutionEndDate(legacy.executionEndDate)
        if (typeof legacy.agreementText === 'string') setAgreementText(legacy.agreementText)
        if (Array.isArray(legacy.approvalOrder) && legacy.approvalOrder.length > 0) {
          applyPayloadToState({ approvalOrder: legacy.approvalOrder as ApprovalOrderItem[] })
        }
        setServerDraftDocId(null)
      }
    } catch {
      localStorage.removeItem(autosaveKey)
    } finally {
      hasRestoredAutosaveRef.current = true
    }
  }, [applyPayloadToState, autosaveKey, enabled])

  useEffect(() => {
    if (!enabled || !autosaveKey || typeof window === 'undefined' || !hasRestoredAutosaveRef.current) return

    const timer = window.setTimeout(() => {
      persistLocalPayload()
    }, 500)

    return () => window.clearTimeout(timer)
  }, [agreementText, approvalOrder, autosaveKey, content, docType, enabled, executionEndDate, executionStartDate, persistLocalPayload, title, serverDraftDocId])

  useEffect(() => {
    if (!enabled || !autosaveKey || typeof window === 'undefined') return

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (bypassBeforeUnloadRef.current) return
      if (!hasDraftContent) return
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [autosaveKey, enabled, hasDraftContent])

  const resetForm = useCallback(
    (options?: { clearAutosave?: boolean }) => {
      const shouldClearAutosave = options?.clearAutosave !== false
      setDocType('draft_doc')
      setTitle('')
      setContent('')
      setExecutionStartDate('')
      setExecutionEndDate('')
      setAgreementText('')
      setApprovalOrder([makeEmptyApprovalLine()])
      setServerDraftDocId(null)
      setResubmitDocId(null)
      setResubmitHistories([])
      dismissDraftValidationToast()
      setErrorMessage('')
      setLastLocalSaveAt(null)
      setLastServerSaveAt(null)
      if (shouldClearAutosave) clearSavedDraft()
    },
    [clearSavedDraft]
  )

  const reloadFromLocalStorage = useCallback(() => {
    if (!autosaveKey || typeof window === 'undefined') return false
    const raw = localStorage.getItem(autosaveKey)
    if (!raw) return false
    try {
      const parsed = JSON.parse(raw) as Partial<ApprovalDraftAutosavePayloadV2>
      if (parsed.version === 2) {
        applyPayloadToState(parsed)
        if (typeof parsed.savedAt === 'string') setLastLocalSaveAt(parsed.savedAt)
      } else {
        applyPayloadToState({
          ...parsed,
          version: 2,
          serverDraftDocId: null,
        } as ApprovalDraftAutosavePayloadV2)
      }
      return true
    } catch {
      return false
    }
  }, [applyPayloadToState, autosaveKey])

  const saveDraftNow = useCallback(async () => {
    dismissDraftValidationToast()
    setErrorMessage('')
    persistLocalPayload()
    if (!enableServerDraft || !writerId) {
      dismissDraftValidationToast()
      return { ok: true as const, localOnly: true as const }
    }
    setIsDraftSaving(true)
    try {
      const referenceSummary = buildReferenceSummaryForDraft(approvalOrder, users, deptMap)
      const { draftDocId } = await syncWebGeneralDraft({
        supabase,
        draftDocId: serverDraftDocId,
        docType,
        title,
        content,
        writerId,
        writerDeptId: selectedWriter?.dept_id ?? null,
        approvalOrder,
        executionStartDate: executionDateForDb(executionStartDate) ?? '',
        executionEndDate: executionDateForDb(executionEndDate) ?? '',
        cooperationDept: referenceSummary,
        agreementText,
        remarksTag: webDraftRemarksTag,
      })
      setServerDraftDocId(draftDocId)
      setLastServerSaveAt(new Date().toISOString())
      if (autosaveKey && typeof window !== 'undefined') {
        const payload: ApprovalDraftAutosavePayloadV2 = {
          version: 2,
          savedAt: new Date().toISOString(),
          serverDraftDocId: draftDocId,
          docType,
          title,
          content,
          executionStartDate,
          executionEndDate,
          agreementText,
          approvalOrder,
        }
        localStorage.setItem(autosaveKey, JSON.stringify(payload))
      }
      dismissDraftValidationToast()
      return { ok: true as const, localOnly: false as const }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '임시저장에 실패했습니다.'
      showDraftValidationError(setErrorMessage, msg)
      return { ok: false as const, localOnly: false as const }
    } finally {
      setIsDraftSaving(false)
    }
  }, [
    agreementText,
    approvalOrder,
    autosaveKey,
    content,
    deptMap,
    docType,
    enableServerDraft,
    executionEndDate,
    executionStartDate,
    persistLocalPayload,
    selectedWriter,
    serverDraftDocId,
    title,
    users,
    webDraftRemarksTag,
    writerId,
  ])

  const deleteDraftDocument = useCallback(async () => {
    dismissDraftValidationToast()
    setErrorMessage('')
    if (!writerId) {
      clearSavedDraft()
      resetForm({ clearAutosave: true })
      return { ok: true as const }
    }
    setIsDraftDeleting(true)
    try {
      if (resubmitDocId != null) {
        const { error } = await supabase.from('approval_docs').delete().eq('id', resubmitDocId).eq('writer_id', writerId)
        if (error) throw error
        clearSavedDraft()
        resetForm({ clearAutosave: false })
        setResubmitDocId(null)
        setResubmitHistories([])
        return { ok: true as const }
      }
      if (enableServerDraft && serverDraftDocId != null) {
        await deleteWebGeneralDraft(supabase as any, serverDraftDocId, writerId, webDraftRemarksTag)
      }
      clearSavedDraft()
      resetForm({ clearAutosave: false })
      return { ok: true as const }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '삭제에 실패했습니다.'
      showDraftValidationError(setErrorMessage, msg)
      return { ok: false as const }
    } finally {
      setIsDraftDeleting(false)
    }
  }, [clearSavedDraft, enableServerDraft, resetForm, resubmitDocId, serverDraftDocId, webDraftRemarksTag, writerId])

  const loadServerDraftById = useCallback(
    async (draftDocId: number) => {
      dismissDraftValidationToast()
      setErrorMessage('')
      if (!writerId) {
        showDraftValidationError(setErrorMessage, '작성자 정보가 없습니다.')
        return false
      }
      try {
        const { doc, participants } = await fetchWebGeneralDraftBundle(
          supabase as any,
          draftDocId,
          writerId,
          webDraftRemarksTag
        )
        setServerDraftDocId(draftDocId)
        setDocType(String(doc.doc_type ?? 'draft_doc'))
        setTitle(String(doc.title ?? ''))
        setContent(String(doc.content ?? ''))
        setExecutionStartDate(String(doc.execution_start_date ?? '').slice(0, 10))
        setExecutionEndDate(String(doc.execution_end_date ?? '').slice(0, 10))
        setAgreementText(String(doc.agreement_text ?? ''))
        const nextOrder = participants.length > 0 ? participantsToApprovalOrder(participants) : [makeEmptyApprovalLine()]
        setApprovalOrder(nextOrder)
        if (autosaveKey && typeof window !== 'undefined') {
          const payload: ApprovalDraftAutosavePayloadV2 = {
            version: 2,
            savedAt: new Date().toISOString(),
            serverDraftDocId: draftDocId,
            docType: String(doc.doc_type ?? 'draft_doc'),
            title: String(doc.title ?? ''),
            content: String(doc.content ?? ''),
            executionStartDate: String(doc.execution_start_date ?? '').slice(0, 10),
            executionEndDate: String(doc.execution_end_date ?? '').slice(0, 10),
            agreementText: String(doc.agreement_text ?? ''),
            approvalOrder: nextOrder,
          }
          localStorage.setItem(autosaveKey, JSON.stringify(payload))
        }
        setLastLocalSaveAt(new Date().toISOString())
        dismissDraftValidationToast()
        setErrorMessage('')
        return true
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '불러오기에 실패했습니다.'
        showDraftValidationError(setErrorMessage, msg)
        return false
      }
    },
    [autosaveKey, webDraftRemarksTag, writerId]
  )

  const submitDraft = async () => {
    dismissDraftValidationToast()
    setErrorMessage('')
    if (initialResubmitDocId != null && initialResubmitDocId > 0 && resubmitDocId == null) {
      showDraftValidationError(setErrorMessage, '문서를 불러오지 못했습니다. 목록에서 다시 열어 주세요.')
      return false
    }
    if (!title.trim() || isHtmlContentEffectivelyEmpty(content)) {
      showDraftValidationError(setErrorMessage, '제목과 내용을 모두 입력하십시오.')
      return false
    }
    if (!isCompleteValidExecutionDate(executionStartDate) || !isCompleteValidExecutionDate(executionEndDate)) {
      showDraftValidationError(setErrorMessage, '시행 시작일·종료일을 모두 입력하십시오.')
      return false
    }
    if (!writerId) {
      showDraftValidationError(setErrorMessage, '작성자 정보가 없습니다.')
      return false
    }
    if (!writerHasApprovalRight) {
      showDraftValidationError(setErrorMessage, '작성자는 결재권이 있어야 상신할 수 있습니다.')
      return false
    }
    if (!approvalOrder.some((line) => line.role === 'approver' && line.userId.trim())) {
      showDraftValidationError(setErrorMessage, '결재자를 선택하십시오.')
      return false
    }
    const startIso = executionDateForDb(executionStartDate)
    const endIso = executionDateForDb(executionEndDate)
    if (startIso && endIso && endIso < startIso) {
      showDraftValidationError(setErrorMessage, '시행 종료일은 시작일 이후여야 합니다.')
      return false
    }

    const referenceSummary = buildReferenceSummaryForDraft(approvalOrder, users, deptMap)

    setIsSaving(true)
    try {
      const { leftoverDraftIdToDelete, workApprovalNotificationSkipped } = await createApprovalDraft({
        supabase,
        docType,
        title,
        content,
        writerId,
        writerDeptId: selectedWriter?.dept_id ?? null,
        approvalOrder,
        executionStartDate: startIso ?? '',
        executionEndDate: endIso ?? '',
        cooperationDept: referenceSummary,
        agreementText,
        remarks,
        resubmitFromDocId: resubmitDocId ?? undefined,
        promoteDraftDocId:
          resubmitDocId != null ? undefined : enableServerDraft ? serverDraftDocId : undefined,
        draftRemarksTag: webDraftRemarksTag,
      })
      if (workApprovalNotificationSkipped) {
        toast.warning(
          '결재 대기 알림(🔔)을 받을 다른 사용자가 없습니다. 첫 결재 대기가 본인이거나 결재선만 비어 있으면 수신 알림이 만들어지지 않습니다.',
          { duration: 12_000 }
        )
      }
      if (leftoverDraftIdToDelete != null && writerId) {
        const delResult = await deleteWebGeneralDraftWithRetry(
          supabase as any,
          leftoverDraftIdToDelete,
          writerId,
          webDraftRemarksTag
        )
        if (!delResult.ok) {
          toast.warning(
            '상신은 완료되었으나 서버 임시 문서 삭제에 실패했습니다. 통합 문서함에서 임시 문서를 직접 삭제해 주세요.',
            { duration: 10_000 }
          )
        }
      }
      clearSavedDraft()
      setServerDraftDocId(null)
      setResubmitDocId(null)
      setResubmitHistories([])
      setLastLocalSaveAt(null)
      setLastServerSaveAt(null)
      dismissDraftValidationToast()
      setErrorMessage('')
      return true
    } catch (err: any) {
      showDraftValidationError(setErrorMessage, getApprovalCreateErrorMessage(err))
      return false
    } finally {
      setIsSaving(false)
    }
  }

  return {
    isLoading,
    isSaving,
    isDraftSaving,
    isDraftDeleting,
    errorMessage,
    setErrorMessage,
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
    serverDraftDocId,
    users,
    selectableUsers,
    deptMap,
    selectedWriter,
    writerId,
    writerHasApprovalRight,
    lastLocalSaveAt,
    lastServerSaveAt,
    draftedDate,
    hasDraftContent,
    clearSavedDraft,
    resetForm,
    submitDraft,
    saveDraftNow,
    deleteDraftDocument,
    loadServerDraftById,
    reloadFromLocalStorage,
    allowLeavingWithoutBeforeUnloadPrompt,
    resubmitDocId,
    resubmitHistories,
    isResubmitHydrating,
  }
}
