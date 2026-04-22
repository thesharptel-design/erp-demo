'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { buildReferenceSummaryForDraft, formatWriterDepartmentLabel } from '@/lib/approval-draft'
import {
  createOutboundRequestApproval,
  deleteWebOutboundDraft,
  fetchOutboundWebDraftBundle,
  getOutboundApprovalCreateErrorMessage,
  syncOutboundWebDraft,
  WEB_OUTBOUND_DRAFT_REMARKS,
} from '@/lib/outbound-request-draft'
import type { ApprovalRole } from '@/lib/approval-roles'
import type { ApprovalDraftAppUser, ApprovalOrderItem } from '@/components/approvals/ApprovalDraftPaper'
import { isHtmlContentEffectivelyEmpty } from '@/lib/html-content'
import { getAllowedWarehouseIds } from '@/lib/permissions'

type Department = {
  id: number
  dept_name: string
}

type WarehouseRow = { id: number; name: string; is_active?: boolean; sort_order?: number }

type ItemRow = { id: number; item_code: string; item_name: string }

export type OutboundItemLine = { item_id: string; quantity: number }

export type UseOutboundRequestDraftFormParams = {
  enabled?: boolean
  autosaveKey?: string
  enableServerDraft?: boolean
  webDraftRemarksTag?: string
}

type OutboundDraftAutosavePayloadV3 = {
  version: 3
  savedAt: string
  serverDraftDocId: number | null
  title: string
  content: string
  executionStartDate: string
  executionEndDate: string
  agreementText: string
  approvalOrder: ApprovalOrderItem[]
  warehouseId: string
  selectedItems: OutboundItemLine[]
  itemSearchKeyword: string
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

export function useOutboundRequestDraftForm(params: UseOutboundRequestDraftFormParams = {}) {
  const { enabled = true, autosaveKey, enableServerDraft = false, webDraftRemarksTag = WEB_OUTBOUND_DRAFT_REMARKS } =
    params

  const [users, setUsers] = useState<ApprovalDraftAppUser[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([])
  const [items, setItems] = useState<ItemRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDraftSaving, setIsDraftSaving] = useState(false)
  const [isDraftDeleting, setIsDraftDeleting] = useState(false)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [executionStartDate, setExecutionStartDate] = useState('')
  const [executionEndDate, setExecutionEndDate] = useState('')
  const [agreementText, setAgreementText] = useState('')
  const [writerId, setWriterId] = useState('')
  const [approvalOrder, setApprovalOrder] = useState<ApprovalOrderItem[]>([makeEmptyApprovalLine()])
  const [serverDraftDocId, setServerDraftDocId] = useState<number | null>(null)

  const [warehouseId, setWarehouseId] = useState('')
  const [selectedItems, setSelectedItems] = useState<OutboundItemLine[]>([{ item_id: '', quantity: 1 }])
  const [itemSearchKeyword, setItemSearchKeyword] = useState('')

  const [errorMessage, setErrorMessage] = useState('')
  const [lastLocalSaveAt, setLastLocalSaveAt] = useState<string | null>(null)
  const [lastServerSaveAt, setLastServerSaveAt] = useState<string | null>(null)
  const hasRestoredAutosaveRef = useRef(false)
  /** 목록·상신 후 창 닫기 등 의도적 이탈 시 브라우저 beforeunload 경고 생략 */
  const bypassBeforeUnloadRef = useRef(false)

  const allowLeavingWithoutBeforeUnloadPrompt = useCallback(() => {
    bypassBeforeUnloadRef.current = true
  }, [])

  useEffect(() => {
    if (!enabled) return
    let active = true
    setIsLoading(true)

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      let allowedWarehouseIds: number[] | null = null
      if (user) {
        const { data: profile } = await supabase.from('app_users').select('*').eq('id', user.id).single()
        allowedWarehouseIds = await getAllowedWarehouseIds(profile)
      }

      const [usersRes, deptRes, itemsRes] = await Promise.all([
        supabase
          .from('app_users')
          .select(
            'id, login_id, user_name, dept_id, department, user_kind, training_program, school_name, teacher_subject, role_name, can_approval_participate'
          )
          .order('user_name'),
        supabase.from('departments').select('id, dept_name').order('id'),
        supabase.from('items').select('id, item_code, item_name').order('item_code'),
      ])

      let whQuery = supabase
        .from('warehouses')
        .select('id, name, is_active, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (allowedWarehouseIds !== null) {
        if (allowedWarehouseIds.length === 0) {
          if (!active) return
          setUsers((usersRes.data as ApprovalDraftAppUser[]) ?? [])
          setDepartments((deptRes.data as Department[]) ?? [])
          setItems((itemsRes.data as ItemRow[]) ?? [])
          setWarehouses([])
          setWarehouseId('')
          if (user) setWriterId(user.id)
          setIsLoading(false)
          return
        }
        whQuery = whQuery.in('id', allowedWarehouseIds)
      }

      const { data: whData } = await whQuery

      if (!active) return
      setUsers((usersRes.data as ApprovalDraftAppUser[]) ?? [])
      setDepartments((deptRes.data as Department[]) ?? [])
      setItems((itemsRes.data as ItemRow[]) ?? [])
      const whList = (whData as WarehouseRow[]) ?? []
      setWarehouses(whList)
      if (user) setWriterId(user.id)
      if (whList[0]?.id) setWarehouseId(String(whList[0].id))
      setIsLoading(false)
    }

    void load()
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
          agreementText.trim() ||
          warehouseId.trim() ||
          itemSearchKeyword.trim() ||
          selectedItems.some((r) => String(r.item_id).trim()) ||
          approvalOrder.some((line) => line.userId.trim())
      ),
    [
      agreementText,
      approvalOrder,
      content,
      executionEndDate,
      executionStartDate,
      itemSearchKeyword,
      selectedItems,
      title,
      warehouseId,
    ]
  )

  const applyPayloadToState = useCallback(
    (parsed: Partial<OutboundDraftAutosavePayloadV3>) => {
      if (typeof parsed.title === 'string') setTitle(parsed.title)
      if (typeof parsed.content === 'string') setContent(parsed.content)
      if (typeof parsed.executionStartDate === 'string') setExecutionStartDate(parsed.executionStartDate)
      if (typeof parsed.executionEndDate === 'string') setExecutionEndDate(parsed.executionEndDate)
      if (typeof parsed.agreementText === 'string') setAgreementText(parsed.agreementText)
      if ('serverDraftDocId' in parsed && (typeof parsed.serverDraftDocId === 'number' || parsed.serverDraftDocId === null)) {
        setServerDraftDocId(parsed.serverDraftDocId)
      }
      if (typeof parsed.warehouseId === 'string' && parsed.warehouseId) {
        const ok = warehouses.some((w) => String(w.id) === parsed.warehouseId)
        if (ok) setWarehouseId(parsed.warehouseId)
      }
      if (typeof parsed.itemSearchKeyword === 'string') setItemSearchKeyword(parsed.itemSearchKeyword)
      if (Array.isArray(parsed.selectedItems) && parsed.selectedItems.length > 0) {
        setSelectedItems(
          parsed.selectedItems.map((row) => ({
            item_id: String((row as OutboundItemLine).item_id ?? ''),
            quantity: Math.max(1, Number((row as OutboundItemLine).quantity) || 1),
          }))
        )
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
    },
    [warehouses]
  )

  const persistLocalPayload = useCallback(() => {
    if (!autosaveKey || typeof window === 'undefined') return
    const payload: OutboundDraftAutosavePayloadV3 = {
      version: 3,
      savedAt: new Date().toISOString(),
      serverDraftDocId,
      title,
      content,
      executionStartDate,
      executionEndDate,
      agreementText,
      approvalOrder,
      warehouseId,
      selectedItems,
      itemSearchKeyword,
    }
    localStorage.setItem(autosaveKey, JSON.stringify(payload))
    setLastLocalSaveAt(payload.savedAt)
  }, [
    agreementText,
    approvalOrder,
    autosaveKey,
    content,
    executionEndDate,
    executionStartDate,
    itemSearchKeyword,
    selectedItems,
    serverDraftDocId,
    title,
    warehouseId,
  ])

  const clearSavedDraft = useCallback(() => {
    if (!autosaveKey || typeof window === 'undefined') return
    localStorage.removeItem(autosaveKey)
  }, [autosaveKey])

  useEffect(() => {
    if (!enabled || isLoading) return
    if (!autosaveKey || typeof window === 'undefined') {
      hasRestoredAutosaveRef.current = true
      return
    }
    if (hasRestoredAutosaveRef.current) return

    const raw = localStorage.getItem(autosaveKey)
    if (!raw) {
      hasRestoredAutosaveRef.current = true
      return
    }

    try {
      const parsed = JSON.parse(raw) as Partial<OutboundDraftAutosavePayloadV3> & { version?: number }
      if (parsed.version === 3) {
        applyPayloadToState(parsed)
        if (typeof parsed.savedAt === 'string') setLastLocalSaveAt(parsed.savedAt)
      } else {
        setServerDraftDocId(null)
      }
    } catch {
      localStorage.removeItem(autosaveKey)
    } finally {
      hasRestoredAutosaveRef.current = true
    }
  }, [applyPayloadToState, autosaveKey, enabled, isLoading])

  useEffect(() => {
    if (!enabled || !autosaveKey || typeof window === 'undefined' || !hasRestoredAutosaveRef.current) return

    const timer = window.setTimeout(() => {
      persistLocalPayload()
    }, 500)

    return () => window.clearTimeout(timer)
  }, [
    agreementText,
    approvalOrder,
    autosaveKey,
    content,
    enabled,
    executionEndDate,
    executionStartDate,
    itemSearchKeyword,
    persistLocalPayload,
    selectedItems,
    serverDraftDocId,
    title,
    warehouseId,
  ])

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
      setTitle('')
      setContent('')
      setExecutionStartDate('')
      setExecutionEndDate('')
      setAgreementText('')
      setApprovalOrder([makeEmptyApprovalLine()])
      setServerDraftDocId(null)
      setWarehouseId(String(warehouses[0]?.id ?? ''))
      setSelectedItems([{ item_id: '', quantity: 1 }])
      setItemSearchKeyword('')
      setErrorMessage('')
      setLastLocalSaveAt(null)
      setLastServerSaveAt(null)
      if (shouldClearAutosave) clearSavedDraft()
    },
    [clearSavedDraft, warehouses]
  )

  const reloadFromLocalStorage = useCallback(() => {
    if (!autosaveKey || typeof window === 'undefined') return false
    const raw = localStorage.getItem(autosaveKey)
    if (!raw) return false
    try {
      const parsed = JSON.parse(raw) as Partial<OutboundDraftAutosavePayloadV3>
      if (parsed.version === 3) {
        applyPayloadToState(parsed)
        if (typeof parsed.savedAt === 'string') setLastLocalSaveAt(parsed.savedAt)
      } else {
        return false
      }
      return true
    } catch {
      return false
    }
  }, [applyPayloadToState, autosaveKey])

  const itemOptions = useMemo(() => {
    const kw = itemSearchKeyword.trim().toLowerCase()
    const list = !kw
      ? items
      : items.filter(
          (it) =>
            String(it.item_code ?? '')
              .toLowerCase()
              .includes(kw) ||
            String(it.item_name ?? '')
              .toLowerCase()
              .includes(kw)
        )
    return list.map((it) => ({
      value: String(it.id),
      label: `[${it.item_code}] ${it.item_name}`,
      keywords: [it.item_code, it.item_name],
    }))
  }, [items, itemSearchKeyword])

  const addItemRow = useCallback(() => {
    setSelectedItems((prev) => [...prev, { item_id: '', quantity: 1 }])
  }, [])

  const removeItemRow = useCallback((index: number) => {
    setSelectedItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }, [])

  const validateCommon = useCallback(() => {
    if (!title.trim() || isHtmlContentEffectivelyEmpty(content)) {
      setErrorMessage('제목과 내용을 모두 입력하십시오.')
      return false
    }
    if (!writerId) {
      setErrorMessage('작성자 정보가 없습니다.')
      return false
    }
    if (!writerHasApprovalRight) {
      setErrorMessage('작성자는 결재권이 있어야 저장·상신할 수 있습니다.')
      return false
    }
    if (!warehouseId) {
      setErrorMessage('출고 창고를 선택하십시오.')
      return false
    }
    const lines = selectedItems
      .map((r) => ({
        item_id: Number(r.item_id),
        qty: Number(r.quantity),
      }))
      .filter((r) => Number.isFinite(r.item_id) && r.item_id > 0 && Number.isFinite(r.qty) && r.qty >= 1)
    if (lines.length === 0) {
      setErrorMessage('품목을 1개 이상, 수량 1 이상으로 지정하십시오.')
      return false
    }
    if (executionStartDate && executionEndDate && executionEndDate < executionStartDate) {
      setErrorMessage('시행 종료일은 시작일 이후여야 합니다.')
      return false
    }
    return true
  }, [
    content,
    executionEndDate,
    executionStartDate,
    selectedItems,
    title,
    warehouseId,
    writerHasApprovalRight,
    writerId,
  ])

  const saveDraftNow = useCallback(async () => {
    setErrorMessage('')
    persistLocalPayload()
    if (!enableServerDraft || !writerId) {
      return { ok: true as const, localOnly: true as const }
    }
    if (!warehouseId) {
      return { ok: true as const, localOnly: true as const }
    }
    setIsDraftSaving(true)
    try {
      const referenceSummary = buildReferenceSummaryForDraft(approvalOrder, users, deptMap)
      const itemLines = selectedItems
        .map((r) => ({ item_id: Number(r.item_id), qty: Number(r.quantity) }))
        .filter((r) => Number.isFinite(r.item_id) && r.item_id > 0 && Number.isFinite(r.qty) && r.qty >= 1)

      const { draftDocId } = await syncOutboundWebDraft({
        supabase,
        draftDocId: serverDraftDocId,
        title,
        content,
        writerId,
        writerDeptId: selectedWriter?.dept_id ?? null,
        warehouseId: Number(warehouseId),
        itemLines,
        approvalOrder,
        executionStartDate,
        executionEndDate,
        cooperationDept: referenceSummary,
        agreementText,
        remarksTag: webDraftRemarksTag,
      })
      setServerDraftDocId(draftDocId)
      setLastServerSaveAt(new Date().toISOString())
      if (autosaveKey && typeof window !== 'undefined') {
        const payload: OutboundDraftAutosavePayloadV3 = {
          version: 3,
          savedAt: new Date().toISOString(),
          serverDraftDocId: draftDocId,
          title,
          content,
          executionStartDate,
          executionEndDate,
          agreementText,
          approvalOrder,
          warehouseId,
          selectedItems,
          itemSearchKeyword,
        }
        localStorage.setItem(autosaveKey, JSON.stringify(payload))
      }
      return { ok: true as const, localOnly: false as const }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '임시저장에 실패했습니다.'
      setErrorMessage(msg)
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
    enableServerDraft,
    executionEndDate,
    executionStartDate,
    itemSearchKeyword,
    persistLocalPayload,
    selectedItems,
    selectedWriter?.dept_id,
    serverDraftDocId,
    title,
    users,
    warehouseId,
    webDraftRemarksTag,
    writerId,
  ])

  const deleteDraftDocument = useCallback(async () => {
    setErrorMessage('')
    if (!writerId) {
      clearSavedDraft()
      resetForm({ clearAutosave: true })
      return { ok: true as const }
    }
    setIsDraftDeleting(true)
    try {
      if (enableServerDraft && serverDraftDocId != null) {
        await deleteWebOutboundDraft(supabase as any, serverDraftDocId, writerId, webDraftRemarksTag)
      }
      clearSavedDraft()
      resetForm({ clearAutosave: false })
      return { ok: true as const }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '삭제에 실패했습니다.'
      setErrorMessage(msg)
      return { ok: false as const }
    } finally {
      setIsDraftDeleting(false)
    }
  }, [clearSavedDraft, enableServerDraft, resetForm, serverDraftDocId, webDraftRemarksTag, writerId])

  const loadServerDraftById = useCallback(
    async (draftDocId: number) => {
      setErrorMessage('')
      if (!writerId) {
        setErrorMessage('작성자 정보가 없습니다.')
        return false
      }
      try {
        const bundle = await fetchOutboundWebDraftBundle(supabase as any, draftDocId, writerId, webDraftRemarksTag)
        const doc = bundle.doc as Record<string, unknown>
        setServerDraftDocId(draftDocId)
        setTitle(String(doc.title ?? ''))
        setContent(String(doc.content ?? ''))
        setExecutionStartDate(String(doc.execution_start_date ?? '').slice(0, 10))
        setExecutionEndDate(String(doc.execution_end_date ?? '').slice(0, 10))
        setAgreementText(String(doc.agreement_text ?? ''))
        const wh = String(bundle.warehouseId)
        const resolvedWh = warehouses.some((w) => String(w.id) === wh) ? wh : String(warehouses[0]?.id ?? '')
        setWarehouseId(resolvedWh)
        const nextItems: OutboundItemLine[] =
          bundle.itemLines.length > 0
            ? bundle.itemLines.map((row) => ({ item_id: String(row.item_id), quantity: Math.max(1, row.qty) }))
            : [{ item_id: '', quantity: 1 }]
        setSelectedItems(nextItems)
        const nextOrder =
          bundle.participants.length > 0 ? participantsToApprovalOrder(bundle.participants) : [makeEmptyApprovalLine()]
        setApprovalOrder(nextOrder)
        if (autosaveKey && typeof window !== 'undefined') {
          const payload: OutboundDraftAutosavePayloadV3 = {
            version: 3,
            savedAt: new Date().toISOString(),
            serverDraftDocId: draftDocId,
            title: String(doc.title ?? ''),
            content: String(doc.content ?? ''),
            executionStartDate: String(doc.execution_start_date ?? '').slice(0, 10),
            executionEndDate: String(doc.execution_end_date ?? '').slice(0, 10),
            agreementText: String(doc.agreement_text ?? ''),
            approvalOrder: nextOrder,
            warehouseId: resolvedWh,
            selectedItems: nextItems,
            itemSearchKeyword: '',
          }
          localStorage.setItem(autosaveKey, JSON.stringify(payload))
        }
        setItemSearchKeyword('')
        setLastLocalSaveAt(new Date().toISOString())
        return true
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '불러오기에 실패했습니다.'
        setErrorMessage(msg)
        return false
      }
    },
    [autosaveKey, warehouses, webDraftRemarksTag, writerId]
  )

  const submitForApproval = useCallback(async () => {
    setErrorMessage('')
    if (!validateCommon()) {
      return { ok: false as const, outboundRequestId: null as number | null, validationFailed: true as const }
    }
    if (!approvalOrder.some((line) => line.role === 'approver' && line.userId.trim())) {
      setErrorMessage('결재자를 선택하십시오.')
      return { ok: false as const, outboundRequestId: null as number | null, validationFailed: true as const }
    }
    setIsSaving(true)
    try {
      const referenceSummary = buildReferenceSummaryForDraft(approvalOrder, users, deptMap)
      const itemLines = selectedItems
        .map((r) => ({ item_id: Number(r.item_id), qty: Number(r.quantity) }))
        .filter((r) => Number.isFinite(r.item_id) && r.item_id > 0 && Number.isFinite(r.qty) && r.qty >= 1)

      const { outboundRequestId } = await createOutboundRequestApproval({
        supabase,
        title,
        content,
        writerId,
        writerDeptId: selectedWriter?.dept_id ?? null,
        warehouseId: Number(warehouseId),
        itemLines,
        approvalOrder,
        executionStartDate,
        executionEndDate,
        cooperationDept: referenceSummary,
        agreementText,
        mode: 'submit',
      })
      if (enableServerDraft && serverDraftDocId != null && writerId) {
        try {
          await deleteWebOutboundDraft(supabase as any, serverDraftDocId, writerId, webDraftRemarksTag)
        } catch {
          /* 상신은 성공했으므로 임시문서 삭제 실패는 무시 */
        }
      }
      clearSavedDraft()
      setServerDraftDocId(null)
      setLastLocalSaveAt(null)
      setLastServerSaveAt(null)
      return { ok: true as const, outboundRequestId, validationFailed: false as const }
    } catch (err: unknown) {
      setErrorMessage(getOutboundApprovalCreateErrorMessage(err as { code?: string; message: string }))
      return { ok: false as const, outboundRequestId: null as number | null, validationFailed: false as const }
    } finally {
      setIsSaving(false)
    }
  }, [
    agreementText,
    approvalOrder,
    clearSavedDraft,
    content,
    deptMap,
    enableServerDraft,
    executionEndDate,
    executionStartDate,
    selectedItems,
    selectedWriter?.dept_id,
    serverDraftDocId,
    title,
    users,
    validateCommon,
    warehouseId,
    webDraftRemarksTag,
    writerId,
  ])

  return {
    isLoading,
    isSaving,
    isDraftSaving,
    isDraftDeleting,
    errorMessage,
    setErrorMessage,
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
    writerId,
    writerHasApprovalRight,
    draftedDate,
    writerDeptName: formatWriterDepartmentLabel(selectedWriter, deptMap),
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
    hasDraftContent,
    lastLocalSaveAt,
    lastServerSaveAt,
    serverDraftDocId,
    allowLeavingWithoutBeforeUnloadPrompt,
  }
}
