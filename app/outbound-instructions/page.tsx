'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import SearchableCombobox from '@/components/SearchableCombobox';
import TableFilterCombobox from '@/components/TableFilterCombobox';
import { useSingleSubmit } from '@/hooks/useSingleSubmit';
import PageHeader from '@/components/PageHeader';
import OutboundDispatchActionButtons from '@/components/outbound/OutboundDispatchActionButtons';
import { openOutboundRequestDetailViewPopup } from '@/lib/approval-popup';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  formatInboxApproverLineDisplay,
  getOutboundDispatchStatePresentation,
  type ApprovalLineWithName,
} from '@/lib/approval-status';
import {
  hasOutboundPermission,
  isSystemAdminUser,
  type CurrentUserPermissions,
} from '@/lib/permissions';

const generateId = () => Math.random().toString(36).substring(2, 11);

type InventoryRow = Database['public']['Tables']['inventory']['Row'];
type ApprovalLineLite = {
  line_no: number | null;
  status: string | null;
  approver_role: string | null;
  approver_id: string | null;
};
type OutboundApprovalDocLite = {
  id: number;
  drafted_at: string | null;
  approval_lines?: ApprovalLineLite[] | null;
};
type OutboundRequestRow = Database['public']['Tables']['outbound_requests']['Row'] & {
  app_users?: { user_name: string | null } | null;
  warehouses?: { name: string | null } | null;
  approval_doc?: OutboundApprovalDocLite | null;
  approver_line_display?: string;
  drafted_date_display?: string;
};

type RequestItemRow = {
  id: number;
  item_id: number;
  qty: number;
  item: {
    item_code: string;
    item_name: string;
    is_lot_managed: boolean;
    is_sn_managed: boolean;
    is_exp_managed: boolean;
  };
};

type FulfillmentLine = {
  id: string;
  req_item_id: number;
  item_id: number;
  item_code: string;
  item_name: string;
  is_lot: boolean;
  is_sn: boolean;
  is_exp: boolean;
  isTracked: boolean;
  req_qty: number;
  selected_lot: string;
  selected_sn: string;
  selected_exp: string;
  stock_id: string;
  out_qty: number;
};

type ViewerProfile = Partial<
  Pick<
    CurrentUserPermissions,
    | 'id'
    | 'role_name'
    | 'can_manage_permissions'
    | 'can_admin_manage'
    | 'user_kind'
    | 'outbound_role'
    | 'can_outbound_view'
    | 'can_outbound_execute_self'
    | 'can_outbound_assign_handler'
    | 'can_outbound_reassign_recall'
    | 'can_outbound_execute_any'
  >
> | null;

type HandlerOption = { id: string; name: string };
type OutboundBucket = 'pending' | 'completed';
const FILTER_COMBO_EMPTY = [{ value: '', label: '전체' }];

type DispatchHandlerUserRow = Pick<
  CurrentUserPermissions,
  | 'id'
  | 'user_name'
  | 'employee_no'
  | 'school_name'
  | 'major'
  | 'department'
  | 'job_rank'
  | 'training_program'
  | 'teacher_subject'
  | 'role_name'
  | 'can_manage_permissions'
  | 'can_admin_manage'
  | 'can_outbound_view'
  | 'can_outbound_execute_self'
  | 'can_outbound_assign_handler'
  | 'can_outbound_reassign_recall'
  | 'can_outbound_execute_any'
>;

function formatHandlerMetaLabel(user: Partial<DispatchHandlerUserRow>): string {
  const name = String(user.user_name ?? '').trim() || '이름없음';
  const school = String(user.school_name ?? '').trim();
  const major =
    String(user.major ?? '').trim() ||
    String(user.training_program ?? '').trim() ||
    String(user.teacher_subject ?? '').trim();
  const schoolMajor = [school, major].filter(Boolean).join(' ');
  const dept = String(user.department ?? '').trim();
  const rank = String(user.job_rank ?? '').trim();
  const deptRank = [dept, rank].filter(Boolean).join(' ');
  const empNo = String(user.employee_no ?? '').trim();
  const middle = [schoolMajor, deptRank ? `(${deptRank})` : ''].filter(Boolean).join(' ').trim();
  return `${name} · ${middle || '-'} · ${empNo || '-'}`;
}

function getOutboundListStateBadge(req: OutboundRequestRow): { label: string; className: string } {
  const isDone = req.status === 'completed' || req.dispatch_state === 'completed';
  if (isDone) {
    return {
      label: '완료',
      className:
        'inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black border bg-purple-100 text-purple-700 border-purple-200',
    };
  }
  if (req.dispatch_state === 'in_progress') {
    return {
      label: '처리중',
      className:
        'inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black border bg-indigo-50 text-indigo-800 border-indigo-300',
    };
  }
  return {
    label: '출고대기',
    className:
      'inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black border bg-slate-100 text-slate-700 border-slate-300',
  };
}

export default function OutboundInstructionsPage() {
  const [gateLoading, setGateLoading] = useState(true);
  const [isPermissionDenied, setIsPermissionDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewerProfile, setViewerProfile] = useState<ViewerProfile>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [handlerOptions, setHandlerOptions] = useState<HandlerOption[]>([]);
  const [expandedRequestId, setExpandedRequestId] = useState<string>('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeBucket, setActiveBucket] = useState<OutboundBucket>('pending');
  const [filterReqNo, setFilterReqNo] = useState('');
  const [filterTitle, setFilterTitle] = useState('');
  const [filterApproverLine, setFilterApproverLine] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterDraftDate, setFilterDraftDate] = useState('');

  const { isSubmitting: processing, run: runSingleSubmit } = useSingleSubmit();

  const [approvedRequests, setApprovedRequests] = useState<OutboundRequestRow[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<OutboundRequestRow | null>(null);

  const [availableStocks, setAvailableStocks] = useState<InventoryRow[]>([]);
  const [fulfillments, setFulfillments] = useState<FulfillmentLine[]>([]);

  const viewerIsAdmin = useMemo(
    () =>
      isSystemAdminUser(
        viewerProfile
          ? {
              role_name: viewerProfile.role_name ?? null,
              can_manage_permissions: viewerProfile.can_manage_permissions ?? false,
              can_admin_manage: viewerProfile.can_admin_manage ?? false,
            }
          : null
      ),
    [viewerProfile]
  );

  const canAssignHandler = hasOutboundPermission(viewerProfile, 'can_outbound_assign_handler');
  const canReassignRecall = hasOutboundPermission(viewerProfile, 'can_outbound_reassign_recall');
  const canExecuteSelf = hasOutboundPermission(viewerProfile, 'can_outbound_execute_self');
  const canExecuteAny = hasOutboundPermission(viewerProfile, 'can_outbound_execute_any');
  const canRecallByTeacherPolicy =
    String(viewerProfile?.user_kind ?? '').toLowerCase() === 'teacher' || viewerIsAdmin;

  const isCompletedRequest = useCallback((req: OutboundRequestRow) => {
    return req.status === 'completed' || req.dispatch_state === 'completed';
  }, []);

  const fetchApprovedRequests = useCallback(async () => {
    const { data, error } = await supabase
      .from('outbound_requests')
      .select(`
        *,
        app_users:requester_id (user_name),
        warehouses:warehouse_id(name),
        approval_doc:approval_doc_id (
          id,
          drafted_at,
          approval_lines (
            line_no,
            status,
            approver_role,
            approver_id
          )
        )
      `)
      .in('status', ['approved', 'completed'])
      .order('created_at', { ascending: true });

    if (error || !data) {
      setApprovedRequests([]);
      return;
    }

    const rows = data as OutboundRequestRow[];
    const approverIds = [...new Set(
      rows
        .flatMap((row) => row.approval_doc?.approval_lines ?? [])
        .map((line) => String(line.approver_id ?? '').trim())
        .filter(Boolean)
    )];

    const approverNameMap = new Map<string, string>();
    if (approverIds.length > 0) {
      const { data: approverUsers } = await supabase
        .from('app_users')
        .select('id, user_name')
        .in('id', approverIds);
      for (const user of approverUsers ?? []) {
        approverNameMap.set(String(user.id), String(user.user_name ?? '').trim());
      }
    }

    const nextRows = rows.map((row) => {
      const writerName = String(row.app_users?.user_name ?? '').trim() || null;
      const mappedLines: ApprovalLineWithName[] = (row.approval_doc?.approval_lines ?? []).map((line) => ({
        line_no: Number(line.line_no ?? 0),
        status: String(line.status ?? ''),
        approver_role: String(line.approver_role ?? ''),
        user_name: approverNameMap.get(String(line.approver_id ?? '')) ?? '',
      }));
      const approverLineDisplay = formatInboxApproverLineDisplay(writerName, mappedLines);
      const draftedDateSource = row.approval_doc?.drafted_at ?? row.created_at;
      const draftedDateDisplay = draftedDateSource ? String(draftedDateSource).slice(0, 10) : '-';
      return {
        ...row,
        approver_line_display: approverLineDisplay,
        drafted_date_display: draftedDateDisplay,
      };
    });

    setApprovedRequests(nextRows);
  }, []);

  const pendingCount = useMemo(
    () => approvedRequests.filter((req) => !isCompletedRequest(req)).length,
    [approvedRequests, isCompletedRequest]
  );
  const completedCount = useMemo(
    () => approvedRequests.filter((req) => isCompletedRequest(req)).length,
    [approvedRequests, isCompletedRequest]
  );
  const visibleRequests = useMemo(
    () =>
      approvedRequests.filter((req) =>
        activeBucket === 'completed' ? isCompletedRequest(req) : !isCompletedRequest(req)
      ),
    [approvedRequests, activeBucket, isCompletedRequest]
  );
  const filterOptions = useMemo(() => {
    const uniq = (arr: string[]) => [...new Set(arr.map((v) => v.trim()).filter(Boolean))];
    return {
      reqNo: [
        { value: '', label: '전체' },
        ...uniq(visibleRequests.map((r) => String(r.req_no ?? ''))).map((v) => ({ value: v, label: v })),
      ],
      title: [
        { value: '', label: '전체' },
        ...uniq(visibleRequests.map((r) => String(r.purpose ?? ''))).map((v) => ({
          value: v,
          label: v.length > 70 ? `${v.slice(0, 70)}…` : v,
        })),
      ],
      approverLine: [
        { value: '', label: '전체' },
        ...uniq(visibleRequests.map((r) => String(r.approver_line_display ?? ''))).map((v) => ({
          value: v,
          label: v.length > 90 ? `${v.slice(0, 90)}…` : v,
        })),
      ],
      state: [
        { value: '', label: '전체' },
        { value: '출고대기', label: '출고대기' },
        { value: '처리중', label: '처리중' },
        { value: '완료', label: '완료' },
      ],
      draftDate: [
        { value: '', label: '전체' },
        ...uniq(visibleRequests.map((r) => String(r.drafted_date_display ?? ''))).map((v) => ({ value: v, label: v })),
      ],
    };
  }, [visibleRequests]);
  const filteredVisibleRequests = useMemo(() => {
    const qReqNo = filterReqNo.trim().toLowerCase();
    const qTitle = filterTitle.trim().toLowerCase();
    const qLine = filterApproverLine.trim().toLowerCase();
    const qState = filterState.trim();
    const qDate = filterDraftDate.trim();
    return visibleRequests.filter((req) => {
      const reqNo = String(req.req_no ?? '').toLowerCase();
      const title = String(req.purpose ?? '').toLowerCase();
      const line = String(req.approver_line_display ?? '').toLowerCase();
      const date = String(req.drafted_date_display ?? '');
      const state = getOutboundListStateBadge(req).label;
      if (qReqNo && !reqNo.includes(qReqNo)) return false;
      if (qTitle && !title.includes(qTitle)) return false;
      if (qLine && !line.includes(qLine)) return false;
      if (qState && state !== qState) return false;
      if (qDate && !date.includes(qDate)) return false;
      return true;
    });
  }, [visibleRequests, filterReqNo, filterTitle, filterApproverLine, filterState, filterDraftDate]);

  const loadHandlerOptions = useCallback(async () => {
    const { data, error } = await supabase
      .from('app_users')
      .select(`
        id,
        user_name,
        employee_no,
        school_name,
        major,
        department,
        job_rank,
        training_program,
        teacher_subject,
        role_name,
        can_manage_permissions,
        can_admin_manage,
        outbound_role,
        can_outbound_view,
        can_outbound_execute_self,
        can_outbound_assign_handler,
        can_outbound_reassign_recall,
        can_outbound_execute_any
      `)
      .order('user_name');
    if (error || !data) {
      setHandlerOptions([]);
      return;
    }
    const rows = data as Partial<DispatchHandlerUserRow>[];
    setHandlerOptions(
      rows
        .filter((u) => {
          return (
            hasOutboundPermission(u as Partial<CurrentUserPermissions>, 'can_outbound_execute_self') ||
            hasOutboundPermission(u as Partial<CurrentUserPermissions>, 'can_outbound_execute_any')
          );
        })
        .map((u) => ({ id: String(u.id ?? ''), name: formatHandlerMetaLabel(u) }))
        .filter((u) => u.id.length > 0)
    );
  }, []);

  const initData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchApprovedRequests(), loadHandlerOptions()]);
    setLoading(false);
  }, [fetchApprovedRequests, loadHandlerOptions]);

  useEffect(() => {
    let cancelled = false;
    async function gateOutboundView() {
      setGateLoading(true);
      setIsPermissionDenied(false);
      setViewerProfile(null);
      setCurrentUserId(null);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setIsPermissionDenied(true);
          return;
        }

        const { data: profile } = await supabase
          .from('app_users')
          .select(
            `
            id,
            role_name,
            can_manage_permissions,
            can_admin_manage,
            user_kind,
            outbound_role,
            can_outbound_view,
            can_outbound_execute_self,
            can_outbound_assign_handler,
            can_outbound_reassign_recall,
            can_outbound_execute_any
          `
          )
          .eq('id', user.id)
          .single();

        const userCanOutboundView = hasOutboundPermission(
          profile as Partial<
            Pick<
              CurrentUserPermissions,
              | 'role_name'
              | 'can_manage_permissions'
              | 'can_admin_manage'
              | 'outbound_role'
              | 'can_outbound_view'
              | 'can_outbound_execute_self'
              | 'can_outbound_assign_handler'
              | 'can_outbound_reassign_recall'
              | 'can_outbound_execute_any'
            >
          >,
          'can_outbound_view'
        );

        if (!userCanOutboundView) {
          if (!cancelled) setIsPermissionDenied(true);
          return;
        }

        if (!cancelled) {
          setViewerProfile(profile as ViewerProfile);
          setCurrentUserId(user.id);
        }
      } catch {
        if (!cancelled) setIsPermissionDenied(true);
      } finally {
        if (!cancelled) setGateLoading(false);
      }
    }
    void gateOutboundView();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (gateLoading || isPermissionDenied) return;
    void initData();
  }, [gateLoading, isPermissionDenied, initData]);

  const handleSelectRequest = useCallback(async (req: OutboundRequestRow) => {
    setSelectedRequest(req);
    setDetailLoading(true);
    setFulfillments([]);

    const { data: items } = await supabase
      .from('outbound_request_items')
      .select('id, item_id, qty, item:items(item_code, item_name, is_lot_managed, is_sn_managed, is_exp_managed)')
      .eq('outbound_request_id', req.id);

    if (items && Array.isArray(items)) {
      const typedItems = items as unknown as RequestItemRow[];
      const { data: stocks } = await supabase
        .from('inventory')
        .select('*')
        .in(
          'item_id',
          typedItems.map((i) => i.item_id)
        )
        .eq('warehouse_id', req.warehouse_id)
        .gt('current_qty', 0);
      setAvailableStocks((stocks as InventoryRow[]) || []);

      const initialFulfillments: FulfillmentLine[] = typedItems.map((i) => ({
        id: generateId(),
        req_item_id: i.id,
        item_id: i.item_id,
        item_code: i.item.item_code,
        item_name: i.item.item_name,
        is_lot: i.item.is_lot_managed,
        is_sn: i.item.is_sn_managed,
        is_exp: i.item.is_exp_managed,
        isTracked: i.item.is_lot_managed || i.item.is_sn_managed || i.item.is_exp_managed,
        req_qty: i.qty,
        selected_lot: '',
        selected_sn: '',
        selected_exp: '',
        stock_id: '',
        out_qty: i.qty,
      }));
      setFulfillments(initialFulfillments);
    }
    setDetailLoading(false);
  }, []);

  useEffect(() => {
    if (!expandedRequestId) {
      setSelectedRequest(null);
      setFulfillments([]);
      setAvailableStocks([]);
      setDetailLoading(false);
      return;
    }
    const req = approvedRequests.find((r) => String(r.id) === expandedRequestId);
    if (req) void handleSelectRequest(req);
  }, [expandedRequestId, approvedRequests, handleSelectRequest]);

  useEffect(() => {
    if (!expandedRequestId) return;
    const existsInVisible = filteredVisibleRequests.some((req) => String(req.id) === expandedRequestId);
    if (!existsInVisible) setExpandedRequestId('');
  }, [expandedRequestId, filteredVisibleRequests]);

  const handleSmartFilter = (index: number, field: 'selected_lot' | 'selected_sn' | 'selected_exp', value: string) => {
    const newFulfillments = [...fulfillments];
    const f = { ...newFulfillments[index], [field]: value } as FulfillmentLine;

    const myStocks = availableStocks.filter((s) => s.item_id === f.item_id);

    const getFiltered = (lot: string, sn: string, exp: string) => {
      return myStocks.filter(
        (s) =>
          (!lot || s.lot_no === lot) && (!sn || s.serial_no === sn) && (!exp || s.exp_date === exp)
      );
    };

    let filtered = getFiltered(f.selected_lot, f.selected_sn, f.selected_exp);

    if (value !== '') {
      const uniqueLots = [...new Set(filtered.map((s) => s.lot_no).filter(Boolean))];
      const uniqueSns = [...new Set(filtered.map((s) => s.serial_no).filter(Boolean))];
      const uniqueExps = [...new Set(filtered.map((s) => s.exp_date).filter(Boolean))];

      if (f.is_lot && uniqueLots.length === 1) f.selected_lot = uniqueLots[0] as string;
      if (f.is_sn && uniqueSns.length === 1) f.selected_sn = uniqueSns[0] as string;
      if (f.is_exp && uniqueExps.length === 1) f.selected_exp = uniqueExps[0] as string;

      filtered = getFiltered(f.selected_lot, f.selected_sn, f.selected_exp);
    }

    if (filtered.length === 1) {
      const match = filtered[0];
      const lotOk = !f.is_lot || f.selected_lot === match.lot_no;
      const snOk = !f.is_sn || f.selected_sn === match.serial_no;
      const expOk = !f.is_exp || f.selected_exp === match.exp_date;

      if (lotOk && snOk && expOk) {
        f.stock_id = match.id.toString();
        if (f.is_sn) f.out_qty = 1;
      }
    } else {
      f.stock_id = '';
    }

    newFulfillments[index] = f;
    setFulfillments(newFulfillments);
  };

  const handleResetField = (index: number, field: 'selected_lot' | 'selected_sn' | 'selected_exp') => {
    const newFulfillments = [...fulfillments];
    const f = { ...newFulfillments[index] };
    f[field] = '';
    f.stock_id = '';

    if (field === 'selected_sn') {
      f.out_qty = f.req_qty;
    }

    newFulfillments[index] = f;
    setFulfillments(newFulfillments);
  };

  const handleExecuteOutbound = async () => {
    for (const f of fulfillments) {
      if (f.isTracked && !f.stock_id) return alert(`[${f.item_name}] 재고 매핑을 완료해주세요.`);
      if (f.out_qty <= 0) return alert(`[${f.item_name}] 수량을 입력해주세요.`);

      const stock = f.isTracked
        ? availableStocks.find((s) => s.id === parseInt(f.stock_id, 10))
        : availableStocks.find((s) => s.item_id === f.item_id);
      if (!stock || f.out_qty > Number(stock.current_qty))
        return alert(`[${f.item_name}] 잔량이 부족합니다.`);
    }

    if (!confirm('출고를 진행하시겠습니까?')) return;
    if (!selectedRequest) return;

    await runSingleSubmit(async () => {
      try {
        const lines = fulfillments.map((f) => {
          const stock = f.isTracked
            ? availableStocks.find((s) => s.id === parseInt(f.stock_id, 10))
            : availableStocks.find((s) => s.item_id === f.item_id);
          if (!stock) throw new Error(`재고 행을 찾을 수 없습니다: ${f.item_name}`);
          return { inventory_id: stock.id, item_id: f.item_id, qty: f.out_qty };
        });

        const { error: rpcError } = await supabase.rpc('execute_outbound_request_fulfillment', {
          p_outbound_request_id: selectedRequest.id,
          p_lines: lines,
        });
        if (rpcError) throw rpcError;

        alert('✅ 출고 완료!');
        setExpandedRequestId('');
        setSelectedRequest(null);
        void fetchApprovedRequests();
      } catch (e: unknown) {
        alert(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const handleSplitLine = (index: number) => {
    const newF = [...fulfillments];
    newF.splice(index + 1, 0, {
      ...newF[index],
      id: generateId(),
      stock_id: '',
      selected_lot: '',
      selected_sn: '',
      selected_exp: '',
      out_qty: 0,
    });
    setFulfillments(newF);
  };

  const handleRemoveLine = (index: number) => {
    setFulfillments(fulfillments.filter((_, i) => i !== index));
  };

  const handleRefresh = useCallback(() => {
    void initData();
  }, [initData]);

  if (gateLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4 text-center text-sm font-medium text-muted-foreground">
        화면을 불러오는 중입니다…
      </div>
    );
  }

  if (isPermissionDenied) {
    return (
      <div className="mx-auto max-w-screen-2xl space-y-6 px-3 py-6 sm:px-6 sm:py-8">
        <PageHeader
          title="출고 요청 현황"
          description="승인된 출고 요청에 대한 실출고 처리 및 출고 통제입니다."
        />
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-black text-amber-900 sm:text-lg">조회 권한 없음</h2>
          <p className="mt-3 text-sm font-bold leading-relaxed text-amber-800 sm:text-base">
            출고권한(조회) 미부여 상태입니다.
            <br />
            관리자에게 권한 부여를 요청해 주세요.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4 text-center text-sm font-medium text-muted-foreground">
        데이터를 불러오는 중입니다…
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-10.5rem)] max-w-[1800px] flex-col gap-4 bg-background p-4 font-sans md:p-6">
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            출고 요청 현황
            {viewerIsAdmin ? (
              <Badge
                variant="outline"
                className="border-violet-300 bg-violet-50 text-[11px] font-semibold uppercase tracking-wide text-violet-800"
                title="시스템 관리자 계정입니다."
              >
                관리자
              </Badge>
            ) : null}
          </span>
        }
        description={
          <>
            <span>결재 승인된 출고 요청이 시간순으로 표시됩니다. 제목을 눌러 출고 통제·재고 매핑·실출고 차감을 진행합니다.</span>
            <span className="mt-2 block text-xs text-muted-foreground">
              출고요청 조회 화면과 동일한 출고 권한·관리자 예외가 적용됩니다.
            </span>
          </>
        }
        actions={
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void handleRefresh()}>
            <RefreshCw className="mr-1.5 size-3.5" aria-hidden />
            새로고침
          </Button>
        }
      />

      <Card className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-border shadow-sm">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={activeBucket === 'pending' ? 'default' : 'outline'}
              onClick={() => setActiveBucket('pending')}
              className="h-8"
            >
              출고대기 {pendingCount}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activeBucket === 'completed' ? 'default' : 'outline'}
              onClick={() => setActiveBucket('completed')}
              className="h-8"
            >
              출고완료 {completedCount}
            </Button>
            <span className="ml-1 text-xs font-medium text-muted-foreground md:text-sm">
              {activeBucket === 'pending' ? '대기 건이 시간순으로 표시됩니다.' : '완료 건이 시간순으로 표시됩니다.'}
            </span>
          </div>

          <div className="min-h-0 max-h-[min(72vh,44rem)] flex-1 overflow-y-auto overflow-x-hidden rounded-lg border border-border bg-card">
            {filteredVisibleRequests.length === 0 ? (
              <div className="flex min-h-[12rem] items-center justify-center px-4 py-10 text-center text-sm font-medium text-muted-foreground">
                {activeBucket === 'pending' ? '출고 대기 문서가 없습니다.' : '출고 완료 문서가 없습니다.'}
              </div>
            ) : (
              <div className="space-y-1 px-1 py-1 sm:px-2">
                <div className="hidden grid-cols-[11rem_minmax(14rem,1fr)_minmax(16rem,1.1fr)_7rem_7.5rem] gap-3 border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:grid md:px-4">
                  <span>문서번호</span>
                  <span>제목</span>
                  <span>결재라인</span>
                  <span className="text-center">상태</span>
                  <span>기안일</span>
                </div>
                <div className="hidden grid-cols-[11rem_minmax(14rem,1fr)_minmax(16rem,1.1fr)_7rem_7.5rem] gap-3 border-b border-border bg-muted/30 px-2 py-2 text-[11px] font-medium text-muted-foreground md:grid md:px-3">
                  <div className="relative z-[2]">
                    <TableFilterCombobox
                      value={filterReqNo}
                      onChange={setFilterReqNo}
                      options={filterOptions.reqNo.length > 1 ? filterOptions.reqNo : FILTER_COMBO_EMPTY}
                      placeholder="문서번호"
                      showClearOption={false}
                      listMaxHeightClass="max-h-56 overflow-y-auto"
                      creatable
                      dropdownPlacement="auto"
                    />
                  </div>
                  <div className="relative z-[2]">
                    <TableFilterCombobox
                      value={filterTitle}
                      onChange={setFilterTitle}
                      options={filterOptions.title.length > 1 ? filterOptions.title : FILTER_COMBO_EMPTY}
                      placeholder="제목"
                      showClearOption={false}
                      listMaxHeightClass="max-h-56 overflow-y-auto"
                      creatable
                      dropdownPlacement="auto"
                    />
                  </div>
                  <div className="relative z-[2]">
                    <TableFilterCombobox
                      value={filterApproverLine}
                      onChange={setFilterApproverLine}
                      options={filterOptions.approverLine.length > 1 ? filterOptions.approverLine : FILTER_COMBO_EMPTY}
                      placeholder="결재라인"
                      showClearOption={false}
                      listMaxHeightClass="max-h-56 overflow-y-auto"
                      creatable
                      dropdownPlacement="auto"
                    />
                  </div>
                  <div className="relative z-[2]">
                    <TableFilterCombobox
                      value={filterState}
                      onChange={setFilterState}
                      options={filterOptions.state}
                      placeholder="상태"
                      showClearOption={false}
                      listMaxHeightClass="max-h-56 overflow-y-auto"
                      dropdownPlacement="auto"
                      buttonClassName="w-full min-w-0 text-[11px] font-bold py-1.5 px-1.5"
                    />
                  </div>
                  <div className="relative z-[2]">
                    <TableFilterCombobox
                      value={filterDraftDate}
                      onChange={setFilterDraftDate}
                      options={filterOptions.draftDate.length > 1 ? filterOptions.draftDate : FILTER_COMBO_EMPTY}
                      placeholder="YYYY-MM-DD"
                      showClearOption={false}
                      listMaxHeightClass="max-h-56 overflow-y-auto"
                      creatable
                      dropdownPlacement="auto"
                    />
                  </div>
                </div>
                <Accordion
                  type="single"
                  collapsible
                  value={expandedRequestId}
                  onValueChange={(v) => setExpandedRequestId(typeof v === 'string' ? v : '')}
                  className="divide-y divide-border"
                >
                  {filteredVisibleRequests.map((req) => {
                    const dispatchInfo = getOutboundDispatchStatePresentation(req.dispatch_state);
                    const titleText = (req.purpose ?? '').trim() || '(제목 없음)';
                    const panelReady = selectedRequest?.id === req.id;
                    const approverLine = (req.approver_line_display ?? '').trim() || '—';
                    const draftedDate = req.drafted_date_display ?? '-';
                    const stateBadge = getOutboundListStateBadge(req);

                    return (
                      <AccordionItem key={req.id} value={String(req.id)} className="border-0">
                        <AccordionTrigger className="px-3 py-3 hover:no-underline sm:px-4">
                          <div className="grid min-w-0 flex-1 gap-1.5 text-left md:grid-cols-[11rem_minmax(14rem,1fr)_minmax(16rem,1.1fr)_7rem_7.5rem] md:items-center md:gap-3">
                            <button
                              type="button"
                              className="w-fit max-w-full truncate font-mono text-left text-xs text-primary underline-offset-2 hover:underline md:text-[13px]"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                openOutboundRequestDetailViewPopup(req.id);
                              }}
                              title={req.req_no ?? '—'}
                            >
                              {req.req_no ?? '—'}
                            </button>
                            <button
                              type="button"
                              className="min-w-0 truncate text-left text-sm font-semibold text-primary underline-offset-2 hover:underline md:text-[13px]"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                openOutboundRequestDetailViewPopup(req.id);
                              }}
                              title={titleText}
                            >
                              {titleText}
                            </button>
                            <div className="min-w-0 break-words text-xs font-medium leading-relaxed text-foreground md:text-[12px]">
                              {approverLine}
                            </div>
                            <div className="hidden justify-center md:flex">
                              <span className={stateBadge.className}>{stateBadge.label}</span>
                            </div>
                            <div className="text-xs font-medium text-muted-foreground md:text-[12px]">{draftedDate}</div>
                            <div className="flex items-center gap-2 md:hidden">
                              <span className={dispatchInfo.className}>{dispatchInfo.label}</span>
                              <Badge variant="secondary" className="text-[10px] font-medium">
                                {req.warehouses?.name?.trim() || '창고'}
                              </Badge>
                            </div>
                          </div>
                        </AccordionTrigger>
                      <AccordionContent className="px-3 pb-4 sm:px-4">
                        <div className="space-y-4 border-t border-border pt-4">
                          <div className="grid gap-2 text-sm sm:grid-cols-[6rem_1fr] sm:items-baseline">
                            <span className="text-xs font-medium text-muted-foreground">요청자</span>
                            <span className="font-medium text-foreground">
                              {req.app_users?.user_name?.trim() || '—'}
                            </span>
                            <span className="text-xs font-medium text-muted-foreground">창고</span>
                            <span className="font-medium text-foreground">
                              {req.warehouses?.name?.trim() || '—'}
                            </span>
                            <span className="text-xs font-medium text-muted-foreground">출고 통제</span>
                            <span className="font-medium text-foreground">
                              {req.dispatch_handler_name?.trim()
                                ? `담당: ${req.dispatch_handler_name}`
                                : '담당자 미지정'}
                            </span>
                          </div>

                          <OutboundDispatchActionButtons
                            outboundRequestId={req.id}
                            requestStatus={
                              req.status as 'draft' | 'submitted' | 'approved' | 'rejected' | 'completed' | 'cancelled'
                            }
                            dispatchState={
                              (req.dispatch_state as
                                | 'queue'
                                | 'assigned'
                                | 'in_progress'
                                | 'completed'
                                | null) ?? null
                            }
                            handlerUserId={req.dispatch_handler_user_id ?? null}
                            handlerName={req.dispatch_handler_name ?? null}
                            currentUserId={currentUserId}
                            canAssignHandler={canAssignHandler}
                            canReassignRecall={canReassignRecall}
                            canExecuteSelf={canExecuteSelf}
                            canExecuteAny={canExecuteAny}
                            canRecallByTeacherPolicy={canRecallByTeacherPolicy}
                            handlerOptions={handlerOptions}
                            compact
                          />

                          {!panelReady ? (
                            <p className="rounded-lg border border-dashed border-border bg-muted/30 py-8 text-center text-sm text-muted-foreground">
                              품목·재고 정보를 불러오는 중…
                            </p>
                          ) : (
                            <div className="rounded-lg border border-border bg-muted/20 p-3 sm:p-4">
                              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <h3 className="text-sm font-semibold text-foreground">실출고 · 재고 매핑</h3>
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={processing || detailLoading || !panelReady}
                                  onClick={() => void handleExecuteOutbound()}
                                >
                                  실출고 차감 실행
                                </Button>
                              </div>

                              {detailLoading ? (
                                <p className="py-6 text-center text-sm text-muted-foreground">품목·재고를 불러오는 중…</p>
                              ) : fulfillments.length === 0 ? (
                                <p className="py-6 text-center text-sm text-muted-foreground">출고 품목이 없습니다.</p>
                              ) : (
                                <div className="overflow-x-auto rounded-md border border-border bg-card">
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="hover:bg-transparent">
                                        <TableHead className="min-w-[10rem]">품목</TableHead>
                                        <TableHead className="text-center">요청수량</TableHead>
                                        <TableHead className="min-w-[14rem]">재고 매핑</TableHead>
                                        <TableHead className="text-center">출고수량</TableHead>
                                        <TableHead className="text-center">분할</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {fulfillments.map((f, idx) => {
                                        const myStocks = availableStocks.filter((s) => s.item_id === f.item_id);
                                        const availableLots = [
                                          ...new Set(
                                            myStocks
                                              .filter(
                                                (s) =>
                                                  (!f.selected_sn || s.serial_no === f.selected_sn) &&
                                                  (!f.selected_exp || s.exp_date === f.selected_exp)
                                              )
                                              .map((s) => s.lot_no)
                                              .filter(Boolean)
                                          ),
                                        ];
                                        const availableSns = [
                                          ...new Set(
                                            myStocks
                                              .filter(
                                                (s) =>
                                                  (!f.selected_lot || s.lot_no === f.selected_lot) &&
                                                  (!f.selected_exp || s.exp_date === f.selected_exp)
                                              )
                                              .map((s) => s.serial_no)
                                              .filter(Boolean)
                                          ),
                                        ];
                                        const availableExps = [
                                          ...new Set(
                                            myStocks
                                              .filter(
                                                (s) =>
                                                  (!f.selected_lot || s.lot_no === f.selected_lot) &&
                                                  (!f.selected_sn || s.serial_no === f.selected_sn)
                                              )
                                              .map((s) => s.exp_date)
                                              .filter(Boolean)
                                          ),
                                        ];

                                        return (
                                          <TableRow key={f.id}>
                                            <TableCell className="whitespace-normal">
                                              <div className="font-medium text-foreground">{f.item_name}</div>
                                              <div className="text-xs text-muted-foreground">{f.item_code}</div>
                                            </TableCell>
                                            <TableCell className="text-center font-medium">{f.req_qty}</TableCell>
                                            <TableCell className="whitespace-normal">
                                              {f.isTracked ? (
                                                <div className="flex max-w-md flex-col gap-2">
                                                  {f.is_lot && (
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                      <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-800">
                                                        LOT
                                                      </span>
                                                      <SearchableCombobox
                                                        className="min-w-[8rem] flex-1"
                                                        value={f.selected_lot}
                                                        onChange={(v) => handleSmartFilter(idx, 'selected_lot', v)}
                                                        options={availableLots.map((v) => ({
                                                          value: String(v),
                                                          label: String(v),
                                                        }))}
                                                        placeholder="선택"
                                                      />
                                                      <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="size-8 shrink-0"
                                                        onClick={() => handleResetField(idx, 'selected_lot')}
                                                        title="LOT 초기화"
                                                      >
                                                        ↺
                                                      </Button>
                                                    </div>
                                                  )}
                                                  {f.is_sn && (
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                      <span className="shrink-0 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-800">
                                                        S/N
                                                      </span>
                                                      <SearchableCombobox
                                                        className="min-w-[8rem] flex-1"
                                                        value={f.selected_sn}
                                                        onChange={(v) => handleSmartFilter(idx, 'selected_sn', v)}
                                                        options={availableSns.map((v) => ({
                                                          value: String(v),
                                                          label: String(v),
                                                        }))}
                                                        placeholder="선택"
                                                      />
                                                      <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="size-8 shrink-0"
                                                        onClick={() => handleResetField(idx, 'selected_sn')}
                                                        title="S/N 초기화"
                                                      >
                                                        ↺
                                                      </Button>
                                                    </div>
                                                  )}
                                                  {f.is_exp && (
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                      <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                                                        EXP
                                                      </span>
                                                      <SearchableCombobox
                                                        className="min-w-[8rem] flex-1"
                                                        value={f.selected_exp}
                                                        onChange={(v) => handleSmartFilter(idx, 'selected_exp', v)}
                                                        options={availableExps.map((v) => ({
                                                          value: String(v),
                                                          label: String(v),
                                                        }))}
                                                        placeholder="선택"
                                                      />
                                                      <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="size-8 shrink-0"
                                                        onClick={() => handleResetField(idx, 'selected_exp')}
                                                        title="유효기간 초기화"
                                                      >
                                                        ↺
                                                      </Button>
                                                    </div>
                                                  )}
                                                  {f.stock_id ? (
                                                    <p className="text-xs text-muted-foreground">
                                                      가용 잔량:{' '}
                                                      {availableStocks.find((s) => s.id.toString() === f.stock_id)
                                                        ?.current_qty ?? '—'}
                                                    </p>
                                                  ) : null}
                                                </div>
                                              ) : (
                                                <span className="text-xs italic text-muted-foreground">추적 관리 없음</span>
                                              )}
                                            </TableCell>
                                            <TableCell>
                                              <Input
                                                type="number"
                                                className="mx-auto h-9 w-16 text-center font-semibold"
                                                value={f.out_qty}
                                                disabled={f.is_sn && f.selected_sn !== ''}
                                                onChange={(e) => {
                                                  const newF = [...fulfillments];
                                                  newF[idx] = {
                                                    ...newF[idx],
                                                    out_qty: parseInt(e.target.value, 10) || 0,
                                                  };
                                                  setFulfillments(newF);
                                                }}
                                              />
                                            </TableCell>
                                            <TableCell>
                                              <div className="flex flex-col items-center gap-1">
                                                <Button
                                                  type="button"
                                                  variant="secondary"
                                                  size="icon"
                                                  className="size-8"
                                                  onClick={() => handleSplitLine(idx)}
                                                  title="재고 분할"
                                                >
                                                  +
                                                </Button>
                                                {fulfillments.filter((line) => line.req_item_id === f.req_item_id)
                                                  .length > 1 ? (
                                                  <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="icon"
                                                    className="size-8 text-destructive hover:text-destructive"
                                                    onClick={() => handleRemoveLine(idx)}
                                                    title="행 제거"
                                                  >
                                                    ✕
                                                  </Button>
                                                ) : null}
                                              </div>
                                            </TableCell>
                                          </TableRow>
                                        );
                                      })}
                                    </TableBody>
                                  </Table>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
                </Accordion>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
