'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  createApprovalDraft,
  getApprovalCreateErrorMessage,
} from '@/lib/approval-draft'
import type { ApprovalDraftAppUser, ApprovalOrderItem } from '@/components/approvals/ApprovalDraftPaper'

type Department = {
  id: number
  dept_name: string
}

type UseApprovalDraftFormParams = {
  enabled?: boolean
  remarks: string
  autosaveKey?: string
}

type ApprovalDraftAutosavePayload = {
  version: 1
  savedAt: string
  docType: string
  title: string
  content: string
  executionStartDate: string
  executionEndDate: string
  cooperationDept: string
  agreementText: string
  approvalOrder: ApprovalOrderItem[]
}

function makeEmptyApprovalLine(): ApprovalOrderItem {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, role: 'approver', userId: '' }
}

export function useApprovalDraftForm({ enabled = true, remarks, autosaveKey }: UseApprovalDraftFormParams) {
  const [users, setUsers] = useState<ApprovalDraftAppUser[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const [docType, setDocType] = useState('draft_doc')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [executionStartDate, setExecutionStartDate] = useState('')
  const [executionEndDate, setExecutionEndDate] = useState('')
  const [cooperationDept, setCooperationDept] = useState('')
  const [agreementText, setAgreementText] = useState('')
  const [writerId, setWriterId] = useState('')
  const [approvalOrder, setApprovalOrder] = useState<ApprovalOrderItem[]>([makeEmptyApprovalLine()])
  const [errorMessage, setErrorMessage] = useState('')
  const hasRestoredAutosaveRef = useRef(false)

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
          .select('id, login_id, user_name, dept_id, role_name, can_approval_participate')
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
          cooperationDept.trim() ||
          agreementText.trim() ||
          approvalOrder.some((line) => line.userId.trim())
      ),
    [agreementText, approvalOrder, content, cooperationDept, executionEndDate, executionStartDate, title]
  )

  const clearSavedDraft = () => {
    if (!autosaveKey || typeof window === 'undefined') return
    localStorage.removeItem(autosaveKey)
  }

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
      const parsed = JSON.parse(raw) as Partial<ApprovalDraftAutosavePayload>
      if (parsed.docType) setDocType(parsed.docType)
      if (typeof parsed.title === 'string') setTitle(parsed.title)
      if (typeof parsed.content === 'string') setContent(parsed.content)
      if (typeof parsed.executionStartDate === 'string') setExecutionStartDate(parsed.executionStartDate)
      if (typeof parsed.executionEndDate === 'string') setExecutionEndDate(parsed.executionEndDate)
      if (typeof parsed.cooperationDept === 'string') setCooperationDept(parsed.cooperationDept)
      if (typeof parsed.agreementText === 'string') setAgreementText(parsed.agreementText)
      if (Array.isArray(parsed.approvalOrder) && parsed.approvalOrder.length > 0) {
        const normalizedOrder = parsed.approvalOrder
          .map((line) => ({
            id: String(line.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
            role: line.role === 'reviewer' || line.role === 'cooperator' || line.role === 'approver' ? line.role : 'approver',
            userId: String(line.userId || ''),
          }))
          .filter((line) => line.role)
        setApprovalOrder(normalizedOrder.length > 0 ? normalizedOrder : [makeEmptyApprovalLine()])
      }
    } catch {
      localStorage.removeItem(autosaveKey)
    } finally {
      hasRestoredAutosaveRef.current = true
    }
  }, [autosaveKey, enabled])

  useEffect(() => {
    if (!enabled || !autosaveKey || typeof window === 'undefined' || !hasRestoredAutosaveRef.current) return

    const timer = window.setTimeout(() => {
      const payload: ApprovalDraftAutosavePayload = {
        version: 1,
        savedAt: new Date().toISOString(),
        docType,
        title,
        content,
        executionStartDate,
        executionEndDate,
        cooperationDept,
        agreementText,
        approvalOrder,
      }
      localStorage.setItem(autosaveKey, JSON.stringify(payload))
    }, 500)

    return () => window.clearTimeout(timer)
  }, [
    agreementText,
    approvalOrder,
    autosaveKey,
    content,
    cooperationDept,
    docType,
    enabled,
    executionEndDate,
    executionStartDate,
    title,
  ])

  useEffect(() => {
    if (!enabled || !autosaveKey || typeof window === 'undefined') return

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasDraftContent) return
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [autosaveKey, enabled, hasDraftContent])

  const resetForm = (options?: { clearAutosave?: boolean }) => {
    const shouldClearAutosave = options?.clearAutosave !== false
    setDocType('draft_doc')
    setTitle('')
    setContent('')
    setExecutionStartDate('')
    setExecutionEndDate('')
    setCooperationDept('')
    setAgreementText('')
    setApprovalOrder([makeEmptyApprovalLine()])
    setErrorMessage('')
    if (shouldClearAutosave) clearSavedDraft()
  }

  const submitDraft = async () => {
    setErrorMessage('')
    if (!title.trim() || !content.trim()) {
      setErrorMessage('제목과 내용을 모두 입력하십시오.')
      return false
    }
    if (!writerId) {
      setErrorMessage('작성자 정보가 없습니다.')
      return false
    }
    if (!writerHasApprovalRight) {
      setErrorMessage('작성자는 결재권이 있어야 상신할 수 있습니다.')
      return false
    }
    if (!approvalOrder.some((line) => line.role === 'approver' && line.userId.trim())) {
      setErrorMessage('결재자를 선택하십시오.')
      return false
    }
    if (selectedWriter?.dept_id === null || selectedWriter?.dept_id === undefined) {
      setErrorMessage('작성자에게 부서(dept_id)가 배정되지 않았습니다.')
      return false
    }
    if (executionStartDate && executionEndDate && executionEndDate < executionStartDate) {
      setErrorMessage('시행 종료일은 시작일 이후여야 합니다.')
      return false
    }

    setIsSaving(true)
    try {
      await createApprovalDraft({
        supabase,
        docType,
        title,
        content,
        writerId,
        writerDeptId: selectedWriter.dept_id,
        approvalOrder,
        executionStartDate,
        executionEndDate,
        cooperationDept,
        agreementText,
        remarks,
      })
      clearSavedDraft()
      return true
    } catch (err: any) {
      setErrorMessage(getApprovalCreateErrorMessage(err))
      return false
    } finally {
      setIsSaving(false)
    }
  }

  return {
    isLoading,
    isSaving,
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
    clearSavedDraft,
    resetForm,
    submitDraft,
  }
}
