'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { buildReferenceSummaryForDraft, formatWriterDepartmentLabel } from '@/lib/approval-draft'
import {
  createOutboundRequestApproval,
  deleteWebOutboundDraft,
  deleteWebOutboundDraftWithRetry,
  fetchOutboundResubmitBundle,
  fetchOutboundWebDraftBundle,
  getOutboundApprovalCreateErrorMessage,
  syncOutboundWebDraft,
  WEB_OUTBOUND_DRAFT_REMARKS,
} from '@/lib/outbound-request-draft'
import { toast } from 'sonner'
import type { ApprovalRole } from '@/lib/approval-roles'
import type { ApprovalDraftAppUser, ApprovalOrderItem } from '@/components/approvals/ApprovalDraftPaper'
import { isHtmlContentEffectivelyEmpty } from '@/lib/html-content'
import { executionDateForDb, isCompleteValidExecutionDate } from '@/lib/execution-date-input'
import {
  dismissDraftValidationToast,
  showDraftServerSaveFailedWithLocalPersisted,
  showDraftValidationError,
} from '@/lib/draft-form-feedback'
import { formatDraftServerSaveFailureReason } from '@/lib/draft-server-save-errors'
import type { ApprovalProcessHistoryRow } from '@/components/approvals/ApprovalProcessHistoryPanel'
import { resolveAppUserRowIdFromAuthSession } from '@/lib/app-user-id'

type Department = {
  id: number
  dept_name: string
}

type WarehouseRow = { id: number; name: string; is_active?: boolean; sort_order?: number }
type AccessibleWarehousesApiResponse = {
  has_full_access: boolean
  warehouse_ids: number[]
  warehouses: Array<{ id: number; name: string }>
}

type StockItemRow = {
  id: number
  item_id: number
  current_qty: number
  lot_no: string | null
  exp_date: string | null
  serial_no: string | null
  items: {
    id: number
    item_code: string
    item_name: string
    is_lot_managed: boolean
    is_exp_managed: boolean
    is_sn_managed: boolean
  } | null
}

type ReservedOutboundItem = {
  outbound_request_id: number
  req_no: string | null
  status: string
  item_id: number
  selected_lot: string | null
  selected_sn: string | null
  selected_exp: string | null
}

export type OutboundItemLine = {
  item_id: string
  quantity: number
  selected_lot?: string
  selected_exp?: string
  selected_sn?: string
}

export type UseOutboundRequestDraftFormParams = {
  enabled?: boolean
  autosaveKey?: string
  /** 임시저장 전 첨부를 묶는 세션 키 */
  draftSessionKey?: string | null
  enableServerDraft?: boolean
  webDraftRemarksTag?: string
  /** `/outbound-requests/new?resubmit=` — 회수·반려 출고문서 재상신 */
  initialResubmitDocId?: number | null
}

function pickRandom<T>(list: T[]): T | null {
  if (!Array.isArray(list) || list.length === 0) return null
  const index = Math.floor(Math.random() * list.length)
  return list[index] ?? null
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
  const {
    enabled = true,
    autosaveKey,
    draftSessionKey = null,
    enableServerDraft = false,
    webDraftRemarksTag = WEB_OUTBOUND_DRAFT_REMARKS,
    initialResubmitDocId = null,
  } = params

  const [users, setUsers] = useState<ApprovalDraftAppUser[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([])
  const [stockRows, setStockRows] = useState<StockItemRow[]>([])
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
  const [resubmitDocId, setResubmitDocId] = useState<number | null>(null)
  const [resubmitHistories, setResubmitHistories] = useState<ApprovalProcessHistoryRow[]>([])
  const [isResubmitHydrating, setIsResubmitHydrating] = useState(
    () => initialResubmitDocId != null && initialResubmitDocId > 0
  )

  const [warehouseId, setWarehouseId] = useState('')
  const [selectedItems, setSelectedItems] = useState<OutboundItemLine[]>([{ item_id: '', quantity: 1 }])
  const [itemSearchKeyword, setItemSearchKeyword] = useState('')

  const [errorMessage, setErrorMessage] = useState('')
  const [reservedOutboundItems, setReservedOutboundItems] = useState<ReservedOutboundItem[]>([])
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
      const {
        data: { session },
      } = await supabase.auth.getSession()

      let allowedWarehouseIds: number[] | null = null
      let accessibleWarehousesFromApi: WarehouseRow[] | null = null
      if (session?.access_token) {
        const response = await fetch('/api/warehouses/accessible', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        })
        if (response.ok) {
          const payload = (await response.json()) as AccessibleWarehousesApiResponse
          allowedWarehouseIds = Array.isArray(payload.warehouse_ids)
            ? payload.warehouse_ids
                .map((id) => Number(id))
                .filter((id) => Number.isInteger(id) && id > 0)
            : []
          accessibleWarehousesFromApi = Array.isArray(payload.warehouses)
            ? payload.warehouses
                .map((row) => ({ id: Number(row.id), name: String(row.name ?? '').trim() }))
                .filter((row) => Number.isInteger(row.id) && row.id > 0 && row.name.length > 0)
            : []
        }
      }

      const usersSelectWithEmail =
        'id, email, login_id, user_name, employee_no, dept_id, department, user_kind, training_program, school_name, teacher_subject, role_name, can_approval_participate'
      const usersSelectNoEmail =
        'id, login_id, user_name, employee_no, dept_id, department, user_kind, training_program, school_name, teacher_subject, role_name, can_approval_participate'

      const [usersRes, deptRes] = await Promise.all([
        (async () => {
          let r: any = await supabase.from('app_users').select(usersSelectWithEmail).order('user_name')
          if (
            r.error &&
            /(\bemail\b|column).*does not exist/i.test(String(r.error.message ?? ''))
          ) {
            r = await supabase.from('app_users').select(usersSelectNoEmail).order('user_name')
          }
          return r
        })(),
        supabase.from('departments').select('id, dept_name').order('id'),
      ])

      if (allowedWarehouseIds !== null && allowedWarehouseIds.length === 0) {
        if (!active) return
        const rows = (usersRes.data as ApprovalDraftAppUser[]) ?? []
        setUsers(rows)
        setDepartments((deptRes.data as Department[]) ?? [])
        setStockRows([])
        setWarehouses([])
        setWarehouseId('')
        if (user) setWriterId(resolveAppUserRowIdFromAuthSession(rows, user))
        setIsLoading(false)
        return
      }

      let whList: WarehouseRow[] = []
      if (accessibleWarehousesFromApi) {
        whList = accessibleWarehousesFromApi
      } else {
        let whQuery = supabase
          .from('warehouses')
          .select('id, name, is_active, sort_order')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })

        if (allowedWarehouseIds !== null) {
          whQuery = whQuery.in('id', allowedWarehouseIds)
        }

        const { data: whData } = await whQuery
        whList = (whData as WarehouseRow[]) ?? []
      }

      if (!active) return
      const rows = (usersRes.data as ApprovalDraftAppUser[]) ?? []
      setUsers(rows)
      setDepartments((deptRes.data as Department[]) ?? [])
      setWarehouses(whList)
      if (user) setWriterId(resolveAppUserRowIdFromAuthSession(rows, user))
      if (whList[0]?.id) setWarehouseId(String(whList[0].id))
      setIsLoading(false)
    }

    void load()
    return () => {
      active = false
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || !warehouseId) {
      setStockRows([])
      return
    }
    let cancelled = false
    ;(async () => {
      const warehouseNumber = Number(warehouseId)
      if (!Number.isInteger(warehouseNumber) || warehouseNumber <= 0) {
        setStockRows([])
        return
      }
      const { data } = await supabase
        .from('inventory')
        .select(
          `
          id,
          item_id,
          current_qty,
          lot_no,
          exp_date,
          serial_no,
          items!inner(id, item_code, item_name, is_lot_managed, is_exp_managed, is_sn_managed)
        `
        )
        .eq('warehouse_id', warehouseNumber)
        .gt('current_qty', 0)
      if (cancelled) return
      setStockRows((data as unknown as StockItemRow[]) ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [enabled, warehouseId])

  useEffect(() => {
    if (!enabled || !warehouseId) {
      setReservedOutboundItems([])
      return
    }
    let cancelled = false
    ;(async () => {
      const warehouseNumber = Number(warehouseId)
      if (!Number.isInteger(warehouseNumber) || warehouseNumber <= 0) {
        setReservedOutboundItems([])
        return
      }
      const { data: openRequests } = await supabase
        .from('outbound_requests')
        .select('id, req_no, status')
        .eq('warehouse_id', warehouseNumber)
        .in('status', ['submitted', 'approved'])
      const requestRows = (openRequests ?? []) as Array<{ id: number; req_no: string | null; status: string }>
      if (requestRows.length === 0) {
        if (!cancelled) setReservedOutboundItems([])
        return
      }
      const requestIdMap = new Map(requestRows.map((r) => [r.id, r]))
      const { data: itemRows } = await supabase
        .from('outbound_request_items')
        .select('outbound_request_id, item_id, remarks')
        .in('outbound_request_id', requestRows.map((r) => r.id))
      if (cancelled) return
      const parsed: ReservedOutboundItem[] = ((itemRows ?? []) as Array<{
        outbound_request_id: number
        item_id: number
        remarks: string | null
      }>).map((row) => {
        let selected_lot: string | null = null
        let selected_sn: string | null = null
        let selected_exp: string | null = null
        try {
          const p = row.remarks ? (JSON.parse(row.remarks) as { selected_lot?: unknown; selected_sn?: unknown; selected_exp?: unknown }) : null
          selected_lot = typeof p?.selected_lot === 'string' ? p.selected_lot : null
          selected_sn = typeof p?.selected_sn === 'string' ? p.selected_sn : null
          selected_exp = typeof p?.selected_exp === 'string' ? p.selected_exp : null
        } catch {
          selected_lot = null
          selected_sn = null
          selected_exp = null
        }
        const req = requestIdMap.get(row.outbound_request_id)
        return {
          outbound_request_id: row.outbound_request_id,
          req_no: req?.req_no ?? null,
          status: req?.status ?? 'submitted',
          item_id: Number(row.item_id),
          selected_lot,
          selected_sn,
          selected_exp,
        }
      })
      setReservedOutboundItems(parsed)
    })()
    return () => {
      cancelled = true
    }
  }, [enabled, warehouseId])

  const stockByItemId = useMemo(() => {
    const map = new Map<
      string,
      {
        itemId: string
        itemCode: string
        itemName: string
        totalQty: number
        isLot: boolean
        isExp: boolean
        isSn: boolean
      }
    >()
    for (const row of stockRows) {
      const item = row.items
      const itemId = String(row.item_id)
      if (!item) continue
      const prev = map.get(itemId)
      const qty = Number(row.current_qty ?? 0)
      if (!prev) {
        map.set(itemId, {
          itemId,
          itemCode: item.item_code,
          itemName: item.item_name,
          totalQty: qty,
          isLot: item.is_lot_managed === true,
          isExp: item.is_exp_managed === true,
          isSn: item.is_sn_managed === true,
        })
      } else {
        prev.totalQty += qty
      }
    }
    return map
  }, [stockRows])

  useEffect(() => {
    if (!enabled) return
    setSelectedItems((prev) =>
      prev.map((row) => {
        const exists = stockByItemId.has(String(row.item_id))
        if (!row.item_id || exists) return row
        return {
          ...row,
          item_id: '',
          selected_lot: '',
          selected_exp: '',
          selected_sn: '',
        }
      })
    )
  }, [enabled, stockByItemId])

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
        const bundle = await fetchOutboundResubmitBundle(supabase as any, initialResubmitDocId, writerId)
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
        setTitle(String((bundle.doc as Record<string, unknown>).title ?? ''))
        setContent(String((bundle.doc as Record<string, unknown>).content ?? ''))
        setExecutionStartDate(String((bundle.doc as Record<string, unknown>).execution_start_date ?? '').slice(0, 10))
        setExecutionEndDate(String((bundle.doc as Record<string, unknown>).execution_end_date ?? '').slice(0, 10))
        setAgreementText(String((bundle.doc as Record<string, unknown>).agreement_text ?? ''))
        const resolvedWh = warehouses.some((w) => w.id === bundle.warehouseId)
          ? String(bundle.warehouseId)
          : String(warehouses[0]?.id ?? '')
        setWarehouseId(resolvedWh)
        const nextItems: OutboundItemLine[] =
          bundle.itemLines.length > 0
            ? bundle.itemLines.map((row) => ({
                item_id: String(row.item_id),
                quantity: Math.max(1, row.qty),
                selected_lot: row.selected_lot ?? '',
                selected_exp: row.selected_exp ?? '',
                selected_sn: row.selected_sn ?? '',
              }))
            : [{ item_id: '', quantity: 1 }]
        setSelectedItems(nextItems)
        const nextOrder =
          bundle.participants.length > 0 ? participantsToApprovalOrder(bundle.participants) : [makeEmptyApprovalLine()]
        setApprovalOrder(nextOrder)
        if (autosaveKey && typeof window !== 'undefined') {
          const payload: OutboundDraftAutosavePayloadV3 = {
            version: 3,
            savedAt: new Date().toISOString(),
            serverDraftDocId: null,
            title: String((bundle.doc as Record<string, unknown>).title ?? ''),
            content: String((bundle.doc as Record<string, unknown>).content ?? ''),
            executionStartDate: String((bundle.doc as Record<string, unknown>).execution_start_date ?? '').slice(0, 10),
            executionEndDate: String((bundle.doc as Record<string, unknown>).execution_end_date ?? '').slice(0, 10),
            agreementText: String((bundle.doc as Record<string, unknown>).agreement_text ?? ''),
            approvalOrder: nextOrder,
            warehouseId: resolvedWh,
            selectedItems: nextItems,
            itemSearchKeyword: '',
          }
          localStorage.setItem(autosaveKey, JSON.stringify(payload))
        }
        setItemSearchKeyword('')
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
  }, [autosaveKey, enabled, initialResubmitDocId, writerId, users.length, warehouses])

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
            selected_lot: String((row as OutboundItemLine).selected_lot ?? ''),
            selected_exp: String((row as OutboundItemLine).selected_exp ?? ''),
            selected_sn: String((row as OutboundItemLine).selected_sn ?? ''),
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
      setResubmitDocId(null)
      setResubmitHistories([])
      setWarehouseId(String(warehouses[0]?.id ?? ''))
      setSelectedItems([{ item_id: '', quantity: 1 }])
      setItemSearchKeyword('')
      dismissDraftValidationToast()
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
    const list = Array.from(stockByItemId.values())
    const filtered = !kw
      ? list
      : list.filter((it) => it.itemCode.toLowerCase().includes(kw) || it.itemName.toLowerCase().includes(kw))
    return filtered.map((it) => ({
      value: it.itemId,
      label: `[${it.itemCode}] ${it.itemName} (재고 ${it.totalQty})`,
      keywords: [it.itemCode, it.itemName, String(it.totalQty)],
    }))
  }, [itemSearchKeyword, stockByItemId])

  const notifyIfReservedSelection = useCallback((line: OutboundItemLine) => {
    const itemId = Number(line.item_id)
    if (!Number.isFinite(itemId) || itemId <= 0) return
    const lot = String(line.selected_lot ?? '').trim()
    const sn = String(line.selected_sn ?? '').trim()
    const exp = String(line.selected_exp ?? '').trim()
    const hit = reservedOutboundItems.find((r) => {
      if (r.item_id !== itemId) return false
      const lotMatch = !lot || !r.selected_lot || r.selected_lot === lot
      const snMatch = !sn || !r.selected_sn || r.selected_sn === sn
      const expMatch = !exp || !r.selected_exp || r.selected_exp === exp
      return lotMatch && snMatch && expMatch
    })
    if (!hit) return
    alert(
      `이미 선점된 품목입니다.\n요청서: ${hit.req_no ?? `#${hit.outbound_request_id}`}\n상태: ${hit.status}\n계속 진행 시 재고 부족으로 상신/완료가 차단될 수 있습니다.`
    )
  }, [reservedOutboundItems])

  const applyRandomTrackingSelections = useCallback(
    (lines: OutboundItemLine[]) => {
      let changed = false
      const next = lines.map((line) => {
        const itemMeta = stockByItemId.get(String(line.item_id))
        if (!itemMeta) return line
        if (!itemMeta.isLot && !itemMeta.isExp && !itemMeta.isSn) return line

        let selected_lot = String(line.selected_lot ?? '').trim()
        let selected_exp = String(line.selected_exp ?? '').trim()
        let selected_sn = String(line.selected_sn ?? '').trim()

        const itemStocks = stockRows.filter((row) => Number(row.item_id) === Number(line.item_id))
        if (itemStocks.length === 0) return line

        const lotOptions = Array.from(
          new Set(
            itemStocks
              .filter((row) => (!selected_sn || row.serial_no === selected_sn) && (!selected_exp || String(row.exp_date ?? '') === selected_exp))
              .map((row) => row.lot_no)
              .filter((v): v is string => Boolean(v))
          )
        )
        const snOptions = Array.from(
          new Set(
            itemStocks
              .filter((row) => (!selected_lot || row.lot_no === selected_lot) && (!selected_exp || String(row.exp_date ?? '') === selected_exp))
              .map((row) => row.serial_no)
              .filter((v): v is string => Boolean(v))
          )
        )
        const expOptions = Array.from(
          new Set(
            itemStocks
              .filter((row) => (!selected_lot || row.lot_no === selected_lot) && (!selected_sn || row.serial_no === selected_sn))
              .map((row) => row.exp_date)
              .filter((v): v is string => Boolean(v))
              .map((v) => String(v))
          )
        )

        if (itemMeta.isLot && !selected_lot) {
          const randomLot = pickRandom(lotOptions)
          if (randomLot) {
            selected_lot = randomLot
            changed = true
          }
        }
        if (itemMeta.isSn && !selected_sn) {
          const randomSn = pickRandom(snOptions)
          if (randomSn) {
            selected_sn = randomSn
            changed = true
          }
        }
        if (itemMeta.isExp && !selected_exp) {
          const randomExp = pickRandom(expOptions)
          if (randomExp) {
            selected_exp = randomExp
            changed = true
          }
        }

        return {
          ...line,
          selected_lot,
          selected_exp,
          selected_sn,
        }
      })
      return { lines: next, changed }
    },
    [stockByItemId, stockRows]
  )

  const addItemRow = useCallback(() => {
    setSelectedItems((prev) => [...prev, { item_id: '', quantity: 1 }])
  }, [])

  const removeItemRow = useCallback((index: number) => {
    setSelectedItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }, [])

  const validateCommon = useCallback(() => {
    if (!title.trim() || isHtmlContentEffectivelyEmpty(content)) {
      showDraftValidationError(setErrorMessage, '제목과 내용을 모두 입력하십시오.')
      return false
    }
    if (!writerId) {
      showDraftValidationError(setErrorMessage, '작성자 정보가 없습니다.')
      return false
    }
    if (!writerHasApprovalRight) {
      showDraftValidationError(setErrorMessage, '작성자는 결재권이 있어야 저장·상신할 수 있습니다.')
      return false
    }
    if (!warehouseId) {
      showDraftValidationError(setErrorMessage, '출고 창고를 선택하십시오.')
      return false
    }
    const lines = selectedItems
      .map((r) => ({
        item_id: Number(r.item_id),
        qty: Number(r.quantity),
        selected_lot: String(r.selected_lot ?? '').trim(),
        selected_exp: String(r.selected_exp ?? '').trim(),
        selected_sn: String(r.selected_sn ?? '').trim(),
      }))
      .filter((r) => Number.isFinite(r.item_id) && r.item_id > 0 && Number.isFinite(r.qty) && r.qty >= 1)
    if (lines.length === 0) {
      showDraftValidationError(setErrorMessage, '품목을 1개 이상, 수량 1 이상으로 지정하십시오.')
      return false
    }
    // 기안/상신 시점 재고 검증: 완료 시점 실패를 사전에 차단한다.
    const totalRequestedByItem = new Map<number, number>()
    for (const line of lines) {
      const itemMeta = stockByItemId.get(String(line.item_id))
      const itemLabel = itemMeta ? `[${itemMeta.itemCode}] ${itemMeta.itemName}` : `item_id=${line.item_id}`
      totalRequestedByItem.set(line.item_id, (totalRequestedByItem.get(line.item_id) ?? 0) + line.qty)
      void itemLabel
    }
    for (const [itemId, requestedQty] of totalRequestedByItem.entries()) {
      const itemMeta = stockByItemId.get(String(itemId))
      const itemLabel = itemMeta ? `[${itemMeta.itemCode}] ${itemMeta.itemName}` : `item_id=${itemId}`
      const availableQty = stockRows
        .filter((row) => Number(row.item_id) === Number(itemId))
        .reduce((sum, row) => sum + Number(row.current_qty ?? 0), 0)
      if (availableQty < requestedQty) {
        showDraftValidationError(
          setErrorMessage,
          `재고 부족으로 상신할 수 없습니다. (${itemLabel}, 요청=${requestedQty}, 가용=${availableQty})`
        )
        return false
      }
    }
    const hasAnyExecutionPeriodInput = Boolean(executionStartDate.trim() || executionEndDate.trim())
    if (hasAnyExecutionPeriodInput) {
      if (!isCompleteValidExecutionDate(executionStartDate) || !isCompleteValidExecutionDate(executionEndDate)) {
        showDraftValidationError(setErrorMessage, '시행 시작일·종료일을 모두 입력하십시오.')
        return false
      }
      const startIso = executionDateForDb(executionStartDate)!
      const endIso = executionDateForDb(executionEndDate)!
      if (endIso < startIso) {
        showDraftValidationError(setErrorMessage, '시행 종료일은 시작일 이후여야 합니다.')
        return false
      }
    }
    return true
  }, [
    content,
    executionEndDate,
    executionStartDate,
    selectedItems,
    stockByItemId,
    stockRows,
    title,
    warehouseId,
    writerHasApprovalRight,
    writerId,
  ])

  const saveDraftNow = useCallback(async () => {
    dismissDraftValidationToast()
    setErrorMessage('')
    persistLocalPayload()
    if (!enableServerDraft || !writerId) {
      dismissDraftValidationToast()
      return { ok: true as const, localOnly: true as const }
    }
    if (!warehouseId) {
      dismissDraftValidationToast()
      return { ok: true as const, localOnly: true as const }
    }
    setIsDraftSaving(true)
    try {
      const referenceSummary = buildReferenceSummaryForDraft(approvalOrder, users, deptMap)
      const randomized = applyRandomTrackingSelections(selectedItems)
      const normalizedSelectedItems = randomized.lines
      if (randomized.changed) {
        setSelectedItems(normalizedSelectedItems)
        toast.message('SN/LOT/EXP는 랜덤으로 자동 선택되었습니다. 출고 단계에서 변경할 수 있습니다.')
      }
      const itemLines = normalizedSelectedItems
        .map((r) => ({
          item_id: Number(r.item_id),
          qty: Number(r.quantity),
          selected_lot: r.selected_lot?.trim() || null,
          selected_exp: r.selected_exp?.trim() || null,
          selected_sn: r.selected_sn?.trim() || null,
        }))
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
        executionStartDate: executionDateForDb(executionStartDate) ?? '',
        executionEndDate: executionDateForDb(executionEndDate) ?? '',
        cooperationDept: referenceSummary,
        agreementText,
        remarksTag: webDraftRemarksTag,
      })
      setServerDraftDocId(draftDocId)
      if (draftSessionKey && writerId) {
        await supabase.rpc('touch_temp_approval_attachments', {
          p_draft_session_key: draftSessionKey,
          p_actor_id: writerId,
          p_ttl_hours: 72,
        })
        await supabase.rpc('link_temp_approval_attachments', {
          p_draft_session_key: draftSessionKey,
          p_approval_doc_id: draftDocId,
          p_actor_id: writerId,
        })
      }
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
          selectedItems: normalizedSelectedItems,
          itemSearchKeyword,
        }
        localStorage.setItem(autosaveKey, JSON.stringify(payload))
      }
      dismissDraftValidationToast()
      return { ok: true as const, localOnly: false as const }
    } catch (err: unknown) {
      const detail = formatDraftServerSaveFailureReason(err)
      showDraftServerSaveFailedWithLocalPersisted(setErrorMessage, detail)
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
    applyRandomTrackingSelections,
    selectedWriter?.dept_id,
    serverDraftDocId,
    title,
    users,
    warehouseId,
    webDraftRemarksTag,
    writerId,
    draftSessionKey,
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
        if (draftSessionKey) {
          await supabase
            .from('approval_doc_attachments')
            .delete()
            .eq('draft_session_key', draftSessionKey)
            .eq('created_by', writerId)
            .eq('status', 'temp')
        }
        clearSavedDraft()
        resetForm({ clearAutosave: false })
        setResubmitDocId(null)
        setResubmitHistories([])
        return { ok: true as const }
      }
      if (enableServerDraft && serverDraftDocId != null) {
        await deleteWebOutboundDraft(supabase as any, serverDraftDocId, writerId, webDraftRemarksTag)
      }
      if (draftSessionKey) {
        await supabase
          .from('approval_doc_attachments')
          .delete()
          .eq('draft_session_key', draftSessionKey)
          .eq('created_by', writerId)
          .eq('status', 'temp')
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
  }, [
    clearSavedDraft,
    draftSessionKey,
    enableServerDraft,
    resetForm,
    resubmitDocId,
    serverDraftDocId,
    webDraftRemarksTag,
    writerId,
  ])

  const loadServerDraftById = useCallback(
    async (draftDocId: number) => {
      dismissDraftValidationToast()
      setErrorMessage('')
      if (!writerId) {
        showDraftValidationError(setErrorMessage, '작성자 정보가 없습니다.')
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
            ? bundle.itemLines.map((row) => ({
                item_id: String(row.item_id),
                quantity: Math.max(1, row.qty),
                selected_lot: row.selected_lot ?? '',
                selected_exp: row.selected_exp ?? '',
                selected_sn: row.selected_sn ?? '',
              }))
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
        dismissDraftValidationToast()
        setErrorMessage('')
        return true
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '불러오기에 실패했습니다.'
        showDraftValidationError(setErrorMessage, msg)
        return false
      }
    },
    [autosaveKey, warehouses, webDraftRemarksTag, writerId]
  )

  const submitForApproval = useCallback(async () => {
    dismissDraftValidationToast()
    setErrorMessage('')
    if (!validateCommon()) {
      return { ok: false as const, outboundRequestId: null as number | null, validationFailed: true as const }
    }
    if (!approvalOrder.some((line) => line.role === 'approver' && line.userId.trim())) {
      showDraftValidationError(setErrorMessage, '결재자를 선택하십시오.')
      return { ok: false as const, outboundRequestId: null as number | null, validationFailed: true as const }
    }
    setIsSaving(true)
    try {
      const referenceSummary = buildReferenceSummaryForDraft(approvalOrder, users, deptMap)
      const randomized = applyRandomTrackingSelections(selectedItems)
      const normalizedSelectedItems = randomized.lines
      if (randomized.changed) {
        setSelectedItems(normalizedSelectedItems)
        toast.message('SN/LOT/EXP는 랜덤으로 자동 선택되었습니다. 출고 단계에서 변경할 수 있습니다.')
      }
      const itemLines = normalizedSelectedItems
        .map((r) => ({
          item_id: Number(r.item_id),
          qty: Number(r.quantity),
          selected_lot: r.selected_lot?.trim() || null,
          selected_exp: r.selected_exp?.trim() || null,
          selected_sn: r.selected_sn?.trim() || null,
        }))
        .filter((r) => Number.isFinite(r.item_id) && r.item_id > 0 && Number.isFinite(r.qty) && r.qty >= 1)

      const { docId, outboundRequestId, leftoverDraftIdToDelete } = await createOutboundRequestApproval({
        supabase,
        title,
        content,
        writerId,
        writerDeptId: selectedWriter?.dept_id ?? null,
        warehouseId: Number(warehouseId),
        itemLines,
        approvalOrder,
        executionStartDate: executionDateForDb(executionStartDate) ?? '',
        executionEndDate: executionDateForDb(executionEndDate) ?? '',
        cooperationDept: referenceSummary,
        agreementText,
        mode: 'submit',
        promoteDraftDocId: resubmitDocId != null ? undefined : enableServerDraft ? serverDraftDocId : undefined,
        resubmitFromDocId: resubmitDocId ?? undefined,
        draftRemarksTag: webDraftRemarksTag,
      })
      if (draftSessionKey && writerId) {
        await supabase.rpc('link_temp_approval_attachments', {
          p_draft_session_key: draftSessionKey,
          p_approval_doc_id: docId,
          p_actor_id: writerId,
        })
      }
      if (leftoverDraftIdToDelete != null && writerId) {
        const delResult = await deleteWebOutboundDraftWithRetry(
          supabase as any,
          leftoverDraftIdToDelete,
          writerId,
          webDraftRemarksTag
        )
        if (!delResult.ok) {
          toast.warning(
            '상신은 완료되었으나 서버 임시 문서 삭제에 실패했습니다. 출고 요청 목록에서 임시 문서를 직접 삭제해 주세요.',
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
      return { ok: true as const, outboundRequestId, validationFailed: false as const }
    } catch (err: unknown) {
      showDraftValidationError(
        setErrorMessage,
        getOutboundApprovalCreateErrorMessage(err as { code?: string; message: string })
      )
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
    applyRandomTrackingSelections,
    selectedWriter?.dept_id,
    serverDraftDocId,
    resubmitDocId,
    title,
    users,
    validateCommon,
    warehouseId,
    webDraftRemarksTag,
    writerId,
    draftSessionKey,
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
    stockRows,
    stockByItemId,
    selectedItems,
    setSelectedItems,
    itemSearchKeyword,
    setItemSearchKeyword,
    itemOptions,
    addItemRow,
    removeItemRow,
    notifyIfReservedSelection,
    submitForApproval,
    saveDraftNow,
    deleteDraftDocument,
    loadServerDraftById,
    reloadFromLocalStorage,
    hasDraftContent,
    lastLocalSaveAt,
    lastServerSaveAt,
    serverDraftDocId,
    resubmitDocId,
    resubmitHistories,
    isResubmitHydrating,
    allowLeavingWithoutBeforeUnloadPrompt,
  }
}
