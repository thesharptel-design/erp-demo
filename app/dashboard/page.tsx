'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { openApprovalDocFromInbox } from '@/lib/approval-popup';
import { getApprovalDocDetailedStatusPresentation, getDocDetailOpenHref } from '@/lib/approval-status';
import type { ApprovalDocLike } from '@/lib/approval-status';
import { isSystemAdminUser, type CurrentUserPermissions } from '@/lib/permissions';
import {
  mapInboxRpcItemToDashboardApprovalRow,
  parseApprovalInboxRpcPayload,
} from '@/lib/approval-inbox-rpc';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// --- 타입 정의 ---
type InventoryRow = { item_id: number; current_qty: number; available_qty?: number | null; quarantine_qty?: number | null; };
type ApprovalDocRow = {
  id: number;
  doc_no: string;
  title: string;
  status: string;
  remarks: string | null;
  current_line_no: number | null;
  drafted_at: string;
  doc_type: string | null;
  writer_id: string | null;
  outbound_requests: { id: number }[] | { id: number } | null;
};
type ProductionOrderRow = { id: number; prod_no: string; status: string; prod_date: string; inbound_completed?: boolean; items: { item_name: string } | null; };
type PurchaseOrderRow = { id: number; po_no: string; status: string; po_date: string; remarks: string | null; customers: { customer_name: string } | null; };
type InventoryTransactionRow = { id: number; trans_type: string; trans_date: string; };
type QcRequestRow = { id: number; qc_type: 'raw_material' | 'sample' | 'final_product'; qc_status: 'requested' | 'received' | 'testing' | 'pass' | 'fail' | 'hold'; result_status: 'pending' | 'pass' | 'fail'; request_date: string; };
type WarehouseRow = { id: number; is_active: boolean; };
type CoaFileRow = { id: number; is_active: boolean; };
type LoginAuditRow = { success: boolean; login_at: string; };
type CalendarCell = {
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  dateKey: string;
};
type DashboardScheduleRow = {
  id: number;
  schedule_date: string;
  start_time: string | null;
  end_time: string | null;
  title: string;
  description: string | null;
  location: string | null;
  created_by: string;
  priority: 'high' | 'normal' | 'low';
  created_at?: string;
};

type OpsCleanupNotificationRow = {
  id: string;
  read_at: string | null;
  created_at: string;
  notification_events:
    | {
        type: string;
        title: string | null;
        created_at: string;
      }
    | null;
};

type ScheduleListGroup = {
  startDate: string;
  endDate: string;
  rows: DashboardScheduleRow[];
};

// --- 뱃지(상태) 스타일 헬퍼 ---
const getBadgeStyle = (type: 'gray' | 'blue' | 'green' | 'red' | 'orange') => {
  const base = "px-2.5 py-1 text-[10px] font-black rounded-md uppercase tracking-wider";
  switch(type) {
    case 'gray': return `${base} bg-gray-100 text-gray-500`;
    case 'blue': return `${base} bg-blue-100 text-blue-600`;
    case 'green': return `${base} bg-green-100 text-green-600`;
    case 'red': return `${base} bg-red-100 text-red-600`;
    case 'orange': return `${base} bg-orange-100 text-orange-600`;
    default: return `${base} bg-gray-100 text-gray-500`;
  }
};

const getProductionBadge = (status: string) => {
  switch (status) {
    case 'planned': return <span className={getBadgeStyle('gray')}>생산예정</span>;
    case 'in_progress': return <span className={getBadgeStyle('blue')}>생산중</span>;
    case 'completed': return <span className={getBadgeStyle('green')}>생산완료</span>;
    default: return <span className={getBadgeStyle('gray')}>{status}</span>;
  }
};

const getPurchaseBadge = (status: string) => {
  switch (status) {
    case 'draft': return <span className={getBadgeStyle('gray')}>임시저장</span>;
    case 'ordered': return <span className={getBadgeStyle('blue')}>발주완료</span>;
    case 'received': return <span className={getBadgeStyle('green')}>입고완료</span>;
    case 'cancelled': return <span className={getBadgeStyle('red')}>취소</span>;
    default: return <span className={getBadgeStyle('gray')}>{status}</span>;
  }
};

export default function DashboardPage() {
  const [data, setData] = useState({
    inventory: [] as InventoryRow[],
    approvals: [] as ApprovalDocRow[],
    productionOrders: [] as ProductionOrderRow[],
    purchaseOrders: [] as PurchaseOrderRow[],
    inventoryTransactions: [] as InventoryTransactionRow[],
    qcRequests: [] as QcRequestRow[],
    warehouses: [] as WarehouseRow[],
    coaFiles: [] as CoaFileRow[],
    loginAudits: [] as LoginAuditRow[],
  });
  const [loading, setLoading] = useState(true);
  const [opsCleanupAlert, setOpsCleanupAlert] = useState<{
    unreadCount: number;
    latestTitle: string | null;
    latestCreatedAt: string | null;
  }>({
    unreadCount: 0,
    latestTitle: null,
    latestCreatedAt: null,
  });
  const [dashboardUserId, setDashboardUserId] = useState<string | null>(null);
  const [canManageSchedules, setCanManageSchedules] = useState(false);
  const [schedules, setSchedules] = useState<DashboardScheduleRow[]>([]);
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleEndDate, setScheduleEndDate] = useState('');
  const [scheduleStartTime, setScheduleStartTime] = useState('');
  const [scheduleEndTime, setScheduleEndTime] = useState('');
  const [scheduleDescription, setScheduleDescription] = useState('');
  const [scheduleLocation, setScheduleLocation] = useState('');
  const [schedulePriority, setSchedulePriority] = useState<'high' | 'normal' | 'low'>('normal');
  const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [viewedMonthDate, setViewedMonthDate] = useState<Date | null>(null);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleListVisibleCount, setScheduleListVisibleCount] = useState(4);
  const [scheduleFormPosition, setScheduleFormPosition] = useState<{ top: number; left: number }>({ top: 120, left: 260 });
  const DASHBOARD_CALENDAR_MONTH_STORAGE_KEY = 'dashboardCalendarMonth';
  const calendarFormRef = useRef<HTMLDivElement | null>(null);
  const calendarPanelRef = useRef<HTMLDivElement | null>(null);

  const getKstToday = () => new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const enumerateDateRange = (startDate: string, endDate: string): string[] => {
    const range: string[] = [];
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);
    if (!sy || !sm || !sd || !ey || !em || !ed) return range;
    let cursor = new Date(Date.UTC(sy, sm - 1, sd));
    const end = new Date(Date.UTC(ey, em - 1, ed));
    while (cursor <= end) {
      range.push(cursor.toISOString().slice(0, 10));
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 1));
    }
    return range;
  };

  const getStoredCalendarMonth = (): Date | null => {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(DASHBOARD_CALENDAR_MONTH_STORAGE_KEY);
    if (!raw) return null;
    const matched = raw.match(/^(\d{4})-(\d{2})$/);
    if (!matched) return null;
    const year = Number(matched[1]);
    const month = Number(matched[2]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
    return new Date(Date.UTC(year, month - 1, 1));
  };

  const persistCalendarMonth = (date: Date) => {
    if (typeof window === 'undefined') return;
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    window.localStorage.setItem(DASHBOARD_CALENDAR_MONTH_STORAGE_KEY, `${year}-${month}`);
  };

  const loadSchedules = async () => {
    const { data: scheduleData, error } = await supabase
      .from('dashboard_schedules')
      .select('id, schedule_date, start_time, end_time, title, description, location, created_by, priority, created_at')
      .eq('is_deleted', false)
      .order('schedule_date', { ascending: true })
      .order('start_time', { ascending: true, nullsFirst: false });
    if (error) {
      console.error('Schedule load error:', error);
      return;
    }
    setSchedules((scheduleData as DashboardScheduleRow[]) || []);
  };

  useEffect(() => {
    async function loadData() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const nowKst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
        const initialCalendarBase = getStoredCalendarMonth() ?? nowKst;
        setDashboardUserId(user?.id ?? null);
        const today = getKstToday();
        setScheduleDate(today);
        setScheduleEndDate(today);
        setSelectedCalendarDate(today);
        setViewedMonthDate(initialCalendarBase);

        let nextCanManageSchedules = false;
        if (user?.id) {
          const { data: profile } = await supabase
            .from('app_users')
            .select('role_name, can_manage_permissions, can_admin_manage')
            .eq('id', user.id)
            .single();
          nextCanManageSchedules = isSystemAdminUser(
            profile as Pick<CurrentUserPermissions, 'role_name' | 'can_manage_permissions' | 'can_admin_manage'> | null
          );
          setCanManageSchedules(nextCanManageSchedules);
        } else {
          setCanManageSchedules(false);
        }

        const [
          { data: inventoryData }, { data: approvalsData },
          { data: productionOrdersData }, { data: purchaseOrdersData },
          { data: inventoryTransactionsData }, { data: qcRequestsData }, { data: warehouseData },
          { data: coaFileData }, { data: loginAuditData },
        ] = await Promise.all([
          supabase.from('inventory').select('item_id, current_qty, available_qty, quarantine_qty'),
          (async () => {
            const { data: rawInbox, error: inboxErr } = await supabase.rpc('approval_inbox_query', {
              p_doc_no: null,
              p_doc_type: null,
              p_title: null,
              p_draft_date: null,
              p_approver_line: null,
              p_progress: null,
              p_status: null,
              p_limit: 5,
              p_offset: 0,
            });
            if (inboxErr) {
              console.error('Dashboard approvals (inbox RPC):', inboxErr);
              return { data: [] as ApprovalDocRow[] };
            }
            const payload = parseApprovalInboxRpcPayload(rawInbox);
            if (!payload) return { data: [] as ApprovalDocRow[] };
            return {
              data: payload.items.map(mapInboxRpcItemToDashboardApprovalRow),
            };
          })(),
          supabase.from('production_orders').select(`id, prod_no, status, prod_date, inbound_completed, items:item_id(item_name)`).order('id', { ascending: false }).limit(5),
          supabase.from('purchase_orders').select(`id, po_no, status, po_date, remarks, customers:customer_id(customer_name)`).order('id', { ascending: false }).limit(5),
          supabase.from('inventory_transactions').select('id, trans_type, trans_date').order('id', { ascending: false }),
          supabase.from('qc_requests').select('id, qc_type, qc_status, result_status, request_date').order('id', { ascending: false }),
          supabase.from('warehouses').select('id, is_active'),
          supabase.from('coa_files').select('id, is_active'),
          supabase.from('login_audit_logs').select('success, login_at').order('login_at', { ascending: false }).limit(100),
        ]);
        await loadSchedules();
        if (user?.id && nextCanManageSchedules) {
          const { data: rawOpsNotifications } = await supabase
            .from('user_notifications')
            .select(
              `
                id,
                read_at,
                created_at,
                notification_events!inner (
                  type,
                  title,
                  created_at
                )
              `
            )
            .eq('user_id', user.id)
            .is('archived_at', null)
            .eq('notification_events.type', 'system.attachment_cleanup_failed')
            .order('created_at', { ascending: false })
            .limit(10);

          const normalizedOpsRows = ((rawOpsNotifications ?? []) as unknown[]).filter(Boolean) as OpsCleanupNotificationRow[];
          const unreadCount = normalizedOpsRows.filter((row) => !row.read_at).length;
          const latest = normalizedOpsRows[0] ?? null;
          setOpsCleanupAlert({
            unreadCount,
            latestTitle: latest?.notification_events?.title ?? null,
            latestCreatedAt: latest?.created_at ?? null,
          });
        } else {
          setOpsCleanupAlert({
            unreadCount: 0,
            latestTitle: null,
            latestCreatedAt: null,
          });
        }

        setData({
          inventory: (inventoryData as InventoryRow[]) || [],
          approvals: (approvalsData as ApprovalDocRow[]) || [],
          productionOrders: (productionOrdersData as unknown as ProductionOrderRow[]) || [],
          purchaseOrders: (purchaseOrdersData as unknown as PurchaseOrderRow[]) || [],
          inventoryTransactions: (inventoryTransactionsData as InventoryTransactionRow[]) || [],
          qcRequests: (qcRequestsData as QcRequestRow[]) || [],
          warehouses: (warehouseData as WarehouseRow[]) || [],
          coaFiles: (coaFileData as CoaFileRow[]) || [],
          loginAudits: (loginAuditData as LoginAuditRow[]) || [],
        });
      } catch (error) {
        console.error('Dashboard load error:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    setScheduleListVisibleCount(4);
  }, [viewedMonthDate]);

  useEffect(() => {
    if (!showScheduleForm) return;
    calendarFormRef.current?.focus();
  }, [showScheduleForm]);

  const resetScheduleForm = () => {
    setEditingScheduleId(null);
    setScheduleTitle('');
    setScheduleStartTime('');
    setScheduleEndTime('');
    setScheduleDescription('');
    setScheduleLocation('');
    setSchedulePriority('normal');
    const baseDate = selectedCalendarDate ?? getKstToday();
    setScheduleDate(baseDate);
    setScheduleEndDate(baseDate);
    setShowScheduleForm(false);
  };

  const handleScheduleSubmit = async () => {
    if (!canManageSchedules || scheduleSaving) return;
    const trimmedTitle = scheduleTitle.trim();
    if (!trimmedTitle || !scheduleDate || !dashboardUserId) return;
    const rangeEndDate = scheduleEndDate || scheduleDate;
    if (rangeEndDate < scheduleDate) {
      console.error('Schedule range error: end date before start date');
      return;
    }
    setScheduleSaving(true);
    try {
      if (editingScheduleId) {
        const { error } = await supabase
          .from('dashboard_schedules')
          .update({
            title: trimmedTitle,
            schedule_date: scheduleDate,
            start_time: scheduleStartTime || null,
            end_time: scheduleEndTime || null,
            description: scheduleDescription.trim() || null,
            location: scheduleLocation.trim() || null,
            priority: schedulePriority,
          })
          .eq('id', editingScheduleId);
        if (error) throw error;
      } else {
        const dateRange = enumerateDateRange(scheduleDate, rangeEndDate);
        const payload = dateRange.map((dateValue) => ({
          schedule_date: dateValue,
          start_time: scheduleStartTime || null,
          end_time: scheduleEndTime || null,
          title: trimmedTitle,
          description: scheduleDescription.trim() || null,
          location: scheduleLocation.trim() || null,
          priority: schedulePriority,
          created_by: dashboardUserId,
        }));
        const { error } = await supabase
          .from('dashboard_schedules')
          .insert(payload);
        if (error) throw error;
      }
      await loadSchedules();
      resetScheduleForm();
    } catch (error) {
      console.error('Schedule save error:', error);
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleScheduleEdit = (schedule: DashboardScheduleRow) => {
    if (!canManageSchedules) return;
    setEditingScheduleId(schedule.id);
    setScheduleTitle(schedule.title);
    setScheduleDate(schedule.schedule_date);
    setScheduleEndDate(schedule.schedule_date);
    setScheduleStartTime(schedule.start_time ?? '');
    setScheduleEndTime(schedule.end_time ?? '');
    setScheduleDescription(schedule.description ?? '');
    setScheduleLocation(schedule.location ?? '');
    setSchedulePriority(schedule.priority ?? 'normal');
    if (calendarPanelRef.current) {
      const panelRect = calendarPanelRef.current.getBoundingClientRect();
      setScheduleFormPosition({
        top: Math.max(120, panelRect.height * 0.45),
        left: Math.max(180, panelRect.width * 0.5),
      });
    }
    setShowScheduleForm(true);
  };

  const handleScheduleDelete = async (scheduleId: number) => {
    if (!canManageSchedules || scheduleSaving) return;
    const confirmed = window.confirm('정말 삭제하시겠습니까?');
    if (!confirmed) return;
    setScheduleSaving(true);
    try {
      const { error } = await supabase
        .from('dashboard_schedules')
        .delete()
        .eq('id', scheduleId);
      if (error) throw error;
      await loadSchedules();
      if (editingScheduleId === scheduleId) {
        resetScheduleForm();
      }
    } catch (error) {
      if (error && typeof error === 'object') {
        const e = error as { message?: string; code?: string; details?: string; hint?: string };
        console.error('Schedule delete error:', {
          message: e.message ?? 'unknown error',
          code: e.code ?? null,
          details: e.details ?? null,
          hint: e.hint ?? null,
        });
      } else {
        console.error('Schedule delete error:', String(error));
      }
    } finally {
      setScheduleSaving(false);
    }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-muted/30"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div></div>;

  // 한국 시간(KST) 기준으로 오늘 날짜 구하기
  const today = getKstToday();
  const baseMonthDate = viewedMonthDate ?? new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const monthKorean = new Intl.DateTimeFormat('ko-KR', { month: 'long' }).format(baseMonthDate);
  const currentYear = baseMonthDate.getUTCFullYear();
  const currentMonth = baseMonthDate.getUTCMonth() + 1;
  const [todayYear, todayMonth, todayDate] = today.split('-').map(Number);
  const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const prevMonthDays = new Date(currentYear, currentMonth - 1, 0).getDate();
  const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];
  const calendarCells: CalendarCell[] = [];
  const schedulesByDay = schedules.reduce<Record<number, { count: number; maxPriority: 'high' | 'normal' | 'low' }>>((acc, schedule) => {
    const viewedMonthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    if (!schedule.schedule_date.startsWith(`${viewedMonthKey}-`)) return acc;
    const day = Number(schedule.schedule_date.slice(8, 10));
    if (!Number.isInteger(day) || day <= 0) return acc;
    const current = acc[day] ?? { count: 0, maxPriority: 'low' as const };
    const priorityRank = { low: 1, normal: 2, high: 3 };
    const nextPriority =
      priorityRank[schedule.priority] > priorityRank[current.maxPriority] ? schedule.priority : current.maxPriority;
    acc[day] = { count: current.count + 1, maxPriority: nextPriority };
    return acc;
  }, {});
  const combinedSchedules = [...schedules].sort((a, b) => {
    const dateOrder = a.schedule_date.localeCompare(b.schedule_date);
    if (dateOrder !== 0) return dateOrder;
    if (!a.start_time && !b.start_time) return 0;
    if (!a.start_time) return 1;
    if (!b.start_time) return -1;
    return a.start_time.localeCompare(b.start_time);
  });
  const groupedSchedules = combinedSchedules.reduce<ScheduleListGroup[]>((acc, row) => {
    const lastGroup = acc[acc.length - 1];
    if (!lastGroup) {
      acc.push({ startDate: row.schedule_date, endDate: row.schedule_date, rows: [row] });
      return acc;
    }

    const lastRow = lastGroup.rows[lastGroup.rows.length - 1];
    const sameMeta =
      lastRow.title === row.title &&
      (lastRow.start_time ?? '') === (row.start_time ?? '') &&
      (lastRow.end_time ?? '') === (row.end_time ?? '') &&
      (lastRow.location ?? '') === (row.location ?? '') &&
      (lastRow.description ?? '') === (row.description ?? '') &&
      lastRow.priority === row.priority &&
      lastRow.created_by === row.created_by &&
      (lastRow.created_at ?? '') === (row.created_at ?? '');

    const [ly, lm, ld] = lastGroup.endDate.split('-').map(Number);
    const [ry, rm, rd] = row.schedule_date.split('-').map(Number);
    const nextDate = new Date(Date.UTC(ly, lm - 1, ld + 1)).toISOString().slice(0, 10);
    const isContiguous = `${ry}-${String(rm).padStart(2, '0')}-${String(rd).padStart(2, '0')}` === nextDate;

    if (sameMeta && isContiguous) {
      lastGroup.endDate = row.schedule_date;
      lastGroup.rows.push(row);
      return acc;
    }

    acc.push({ startDate: row.schedule_date, endDate: row.schedule_date, rows: [row] });
    return acc;
  }, []);

  const visibleScheduleItems = groupedSchedules.slice(0, scheduleListVisibleCount);

  for (let idx = 0; idx < 42; idx += 1) {
    if (idx < firstDayOfMonth) {
      const prevMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;
      const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      const prevMonthDay = prevMonthDays - firstDayOfMonth + idx + 1;
      calendarCells.push({
        day: prevMonthDay,
        isCurrentMonth: false,
        isToday: false,
        dateKey: `${prevMonthYear}-${String(prevMonth).padStart(2, '0')}-${String(prevMonthDay).padStart(2, '0')}`,
      });
      continue;
    }

    const day = idx - firstDayOfMonth + 1;
    if (day <= daysInMonth) {
      calendarCells.push({
        day,
        isCurrentMonth: true,
        isToday: currentYear === todayYear && currentMonth === todayMonth && day === todayDate,
        dateKey: `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      });
      continue;
    }

    const nextMonthYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextMonthDay = day - daysInMonth;
    calendarCells.push({
      day: nextMonthDay,
      isCurrentMonth: false,
      isToday: false,
      dateKey: `${nextMonthYear}-${String(nextMonth).padStart(2, '0')}-${String(nextMonthDay).padStart(2, '0')}`,
    });
  }

  const moveCalendarMonth = async (offset: number) => {
    const nextBase = new Date(Date.UTC(currentYear, currentMonth - 1 + offset, 1));
    setViewedMonthDate(nextBase);
    setSelectedCalendarDate(null);
    persistCalendarMonth(nextBase);
  };

  const moveCalendarToToday = async () => {
    const nowKst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
    const todayBase = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), 1));
    setViewedMonthDate(todayBase);
    setSelectedCalendarDate(getKstToday());
    setScheduleDate(getKstToday());
    setScheduleEndDate(getKstToday());
    persistCalendarMonth(todayBase);
  };

  const moveCalendarToYearMonth = async (year: number, month: number) => {
    const nextBase = new Date(Date.UTC(year, month - 1, 1));
    setViewedMonthDate(nextBase);
    setSelectedCalendarDate(null);
    persistCalendarMonth(nextBase);
  };

  const selectableYears = Array.from({ length: 7 }, (_, idx) => currentYear - 3 + idx);

  const handleCalendarDateClick = async (
    cell: CalendarCell,
    event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>
  ) => {
    const targetRect = event.currentTarget.getBoundingClientRect();
    const panelRect = calendarPanelRef.current?.getBoundingClientRect();
    if (panelRect) {
      const rawLeft = targetRect.left + targetRect.width / 2 - panelRect.left;
      const rawTop = targetRect.top - panelRect.top - 12;
      const clampedLeft = Math.min(Math.max(rawLeft, 170), panelRect.width - 170);
      const clampedTop = Math.max(rawTop, 100);
      setScheduleFormPosition({ top: clampedTop, left: clampedLeft });
    }
    setSelectedCalendarDate(cell.dateKey);
    setScheduleDate(cell.dateKey);
    setScheduleEndDate(cell.dateKey);
    setShowScheduleForm(true);
    if (cell.isCurrentMonth) return;
    const clickedYear = Number(cell.dateKey.slice(0, 4));
    const clickedMonth = Number(cell.dateKey.slice(5, 7));
    if (!Number.isInteger(clickedYear) || !Number.isInteger(clickedMonth)) return;
    await moveCalendarToYearMonth(clickedYear, clickedMonth);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[1800px] flex-col gap-6 bg-background p-4 font-sans md:p-6">
      
      {/* 🌟 헤더 영역 */}
      <header>
        <PageHeader
          title="DASHBOARD"
          description=""
        />
        {canManageSchedules ? (
          <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-800">
            <span className="shrink-0">⚠️ 자동정리 실패 알림</span>
            <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] text-white">
              미확인 {opsCleanupAlert.unreadCount}건
            </span>
            <span className="truncate text-rose-700">
              {opsCleanupAlert.latestTitle ?? '현재 실패 알림 없음'}
            </span>
            <Link href="/dashboard?openInbox=notifications" className="shrink-0 underline underline-offset-2">
              알림함(🔔) 확인
            </Link>
          </div>
        ) : null}
      </header>

      {/* 임시 대시보드 위젯: 달력 + 오늘 브리핑 */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div ref={calendarPanelRef} className="relative xl:col-span-2">
        <Card className="border-border shadow-sm">
          <CardContent className="p-6">
          <div className="flex items-end justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground">📅 {currentYear}년 {monthKorean} 캘린더</h2>
            <div className="flex items-center gap-2">
              <select
                value={currentYear}
                onChange={(e) => void moveCalendarToYearMonth(Number(e.target.value), currentMonth)}
                className="rounded-lg border border-input bg-background px-2 py-1 text-[11px] font-semibold text-foreground"
              >
                {selectableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}년
                  </option>
                ))}
              </select>
              <select
                value={currentMonth}
                onChange={(e) => void moveCalendarToYearMonth(currentYear, Number(e.target.value))}
                className="rounded-lg border border-input bg-background px-2 py-1 text-[11px] font-semibold text-foreground"
              >
                {Array.from({ length: 12 }, (_, idx) => idx + 1).map((month) => (
                  <option key={month} value={month}>
                    {month}월
                  </option>
                ))}
              </select>
              <Button
                type="button"
                onClick={() => void moveCalendarMonth(-1)}
                variant="outline"
                size="sm"
                className="h-8 px-2 text-[11px]"
              >
                이전달
              </Button>
              <Button
                type="button"
                onClick={() => void moveCalendarToToday()}
                variant="outline"
                size="sm"
                className="h-8 border-blue-300 bg-blue-50 px-2 text-[11px] text-blue-700 hover:bg-blue-100 hover:text-blue-700"
              >
                오늘
              </Button>
              <Button
                type="button"
                onClick={() => void moveCalendarMonth(1)}
                variant="outline"
                size="sm"
                className="h-8 px-2 text-[11px]"
              >
                다음달
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-2 text-center mb-2">
            {weekdayLabels.map((label) => (
              <div key={label} className={`text-[11px] font-black ${label === '일' ? 'text-rose-500' : label === '토' ? 'text-blue-500' : 'text-muted-foreground'}`}>
                {label}
              </div>
            ))}
          </div>
          <div className="mb-3 flex items-center gap-2 text-[10px] font-bold text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500"></span>일정 있음</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-black"></span>선택 날짜</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500"></span>높은 우선순위</span>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {calendarCells.map((cell, index) => (
              <button
                type="button"
                key={`${cell.day}-${index}`}
                onClick={(e) => void handleCalendarDateClick(cell, e)}
                className={`relative h-14 rounded-xl border text-sm font-bold flex items-center justify-center transition-colors ${
                  selectedCalendarDate &&
                  selectedCalendarDate === cell.dateKey
                    ? 'ring-2 ring-black shadow-[0_0_0_1px_rgba(0,0,0,1)]'
                    : ''
                } ${
                  cell.isToday
                      ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                    : cell.isCurrentMonth
                      ? 'bg-muted/50 border-border text-foreground hover:bg-blue-50'
                      : 'bg-background border-border/70 text-muted-foreground'
                }`}
              >
                <div className="flex flex-col items-center justify-center leading-tight">
                  <span className={cell.isToday ? 'text-base' : ''}>{cell.day}</span>
                  {cell.isCurrentMonth && (schedulesByDay[cell.day]?.count ?? 0) > 0 ? (
                    <span
                      className={`mt-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-black ${
                        schedulesByDay[cell.day]?.maxPriority === 'high'
                          ? 'bg-rose-600 text-white'
                          : schedulesByDay[cell.day]?.maxPriority === 'normal'
                            ? cell.isToday ? 'bg-white text-blue-700' : 'bg-blue-600 text-white'
                            : 'bg-muted-foreground text-white'
                      }`}
                    >
                      {schedulesByDay[cell.day]?.count ?? 0}건
                    </span>
                  ) : null}
                </div>
                {selectedCalendarDate === cell.dateKey ? (
                  <span className={`absolute right-1 top-1 h-2 w-2 rounded-full ${cell.isToday ? 'bg-white' : 'bg-black'}`} />
                ) : null}
              </button>
            ))}
          </div>
          {canManageSchedules ? (
            <div
              ref={calendarFormRef}
              className={`absolute z-20 w-[340px] -translate-x-1/2 -translate-y-full rounded-xl border border-border bg-card p-3 shadow-xl transition-all duration-300 ease-out ${showScheduleForm ? 'pointer-events-auto opacity-100 scale-100' : 'pointer-events-none opacity-0 scale-95'}`}
              style={{ top: scheduleFormPosition.top, left: scheduleFormPosition.left }}
              tabIndex={-1}
            >
              <div className="mb-1 flex items-center justify-between">
                <p className="text-[11px] font-black text-foreground">
                  {editingScheduleId ? '일정 수정' : '일정 등록'}
                </p>
                <button
                  type="button"
                  onClick={() => setShowScheduleForm(false)}
                  className="rounded-md px-2 py-1 text-[10px] font-black text-muted-foreground hover:bg-muted"
                >
                  닫기
                </button>
              </div>
              <p className="text-[11px] font-black text-foreground">
                선택 날짜: {scheduleDate || '-'}
              </p>
              <p className="mt-1 text-[10px] font-bold text-muted-foreground">
                {editingScheduleId ? '수정은 단일 날짜 일정만 변경됩니다.' : '범위 등록: 시작일~종료일까지 동일 일정이 생성됩니다.'}
              </p>
              <div className="mt-2 space-y-2">
                <input
                  value={scheduleTitle}
                  onChange={(e) => setScheduleTitle(e.target.value)}
                  placeholder="일정 제목"
                  className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-xs font-bold text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="rounded-lg border border-input bg-background px-2.5 py-2 text-xs font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <input
                    type="date"
                    value={scheduleEndDate}
                    onChange={(e) => setScheduleEndDate(e.target.value)}
                    disabled={editingScheduleId !== null}
                    className="rounded-lg border border-input bg-background px-2.5 py-2 text-xs font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted disabled:text-muted-foreground"
                  />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    type="time"
                    value={scheduleStartTime}
                    onChange={(e) => setScheduleStartTime(e.target.value)}
                    className="rounded-lg border border-input bg-background px-2.5 py-2 text-xs font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <input
                    type="time"
                    value={scheduleEndTime}
                    onChange={(e) => setScheduleEndTime(e.target.value)}
                    className="rounded-lg border border-input bg-background px-2.5 py-2 text-xs font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <input
                  value={scheduleLocation}
                  onChange={(e) => setScheduleLocation(e.target.value)}
                  placeholder="장소 (선택)"
                  className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-xs font-bold text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'high', label: '높음' },
                    { key: 'normal', label: '보통' },
                    { key: 'low', label: '낮음' },
                  ].map((priority) => (
                    <button
                      key={priority.key}
                      type="button"
                      onClick={() => setSchedulePriority(priority.key as 'high' | 'normal' | 'low')}
                      className={`rounded-lg px-2.5 py-2 text-[11px] font-black ${
                        schedulePriority === priority.key
                          ? priority.key === 'high'
                          ? 'bg-rose-500 text-white'
                            : priority.key === 'normal'
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-700 text-white'
                          : 'border border-input bg-background text-muted-foreground'
                      }`}
                    >
                      {priority.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={scheduleDescription}
                  onChange={(e) => setScheduleDescription(e.target.value)}
                  placeholder="메모 (선택)"
                  rows={2}
                  className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-xs font-bold text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleScheduleSubmit()}
                    disabled={scheduleSaving || !scheduleTitle.trim() || !scheduleDate || !scheduleEndDate || scheduleEndDate < scheduleDate}
                    className="inline-flex items-center rounded-lg bg-blue-500 px-3 py-2 text-[11px] font-black text-white hover:bg-blue-400 disabled:opacity-60"
                  >
                    {scheduleSaving ? '저장 중…' : editingScheduleId ? '수정 저장' : '일정 등록'}
                  </button>
                  {editingScheduleId ? (
                    <button
                      type="button"
                      onClick={resetScheduleForm}
                      className="inline-flex items-center rounded-lg border border-input bg-background px-3 py-2 text-[11px] font-black text-foreground hover:bg-muted"
                    >
                      취소
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
          </CardContent>
        </Card>
        </div>

        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">✨ 일정</CardTitle>
            <p className="text-[11px] font-medium text-muted-foreground">등록된 일정 목록 (현재 선택 월)</p>
          </CardHeader>
          <CardContent className="pt-0">
          <div className="mt-4 rounded-xl border border-border bg-muted/40 px-3 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-black text-foreground">등록 일정 (전체)</span>
              <span className="text-[10px] font-bold text-muted-foreground">{groupedSchedules.length}건</span>
            </div>
            <div className="space-y-2">
              {visibleScheduleItems.length === 0 ? (
                <p className="text-[11px] font-bold text-muted-foreground">등록된 일정이 없습니다.</p>
              ) : (
                visibleScheduleItems.map((group) => {
                  const schedule = group.rows[0];
                  const dateLabel =
                    group.startDate === group.endDate ? group.startDate : `${group.startDate} ~ ${group.endDate}`;
                  return (
                  <div key={`${schedule.id}-${group.startDate}-${group.endDate}`} className="rounded-lg border border-border bg-background px-2.5 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-black text-foreground">{schedule.title}</p>
                        <p className="mt-0.5 text-[10px] font-bold text-muted-foreground">
                          {dateLabel}
                          {' · '}
                          {schedule.start_time ? schedule.start_time.slice(0, 5) : '종일'}
                          {schedule.end_time ? ` ~ ${schedule.end_time.slice(0, 5)}` : ''}
                          {schedule.location ? ` · ${schedule.location}` : ''}
                        </p>
                        <span
                          className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-black ${
                            schedule.priority === 'high'
                              ? 'bg-rose-100 text-rose-700'
                              : schedule.priority === 'normal'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-muted text-foreground'
                          }`}
                        >
                          {schedule.priority === 'high' ? '높음' : schedule.priority === 'normal' ? '보통' : '낮음'}
                        </span>
                      </div>
                      {canManageSchedules ? (
                        <div className="flex flex-shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleScheduleEdit(schedule)}
                            className="rounded-md border border-input bg-background px-2 py-1 text-[10px] font-black text-foreground hover:bg-muted"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleScheduleDelete(schedule.id)}
                            disabled={scheduleSaving}
                            className="rounded-md bg-rose-500/70 px-2 py-1 text-[10px] font-black text-white hover:bg-rose-500 disabled:opacity-60"
                          >
                            삭제
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {schedule.description ? (
                      <p className="mt-1 text-[10px] font-bold text-muted-foreground">{schedule.description}</p>
                    ) : null}
                  </div>
                )})
              )}
            </div>
            {groupedSchedules.length > scheduleListVisibleCount ? (
              <button
                type="button"
                onClick={() => setScheduleListVisibleCount((prev) => prev + 4)}
                className="mt-2 inline-flex items-center rounded-lg bg-background px-2.5 py-1.5 text-[10px] font-black text-muted-foreground border border-input hover:bg-muted"
              >
                ... 더보기
              </button>
            ) : null}
            {groupedSchedules.length > 4 && scheduleListVisibleCount >= groupedSchedules.length ? (
              <button
                type="button"
                onClick={() => setScheduleListVisibleCount(4)}
                className="mt-2 ml-2 inline-flex items-center rounded-lg bg-background px-2.5 py-1.5 text-[10px] font-black text-muted-foreground border border-input hover:bg-muted"
              >
                접기
              </button>
            ) : null}
          </div>
          </CardContent>
        </Card>
      </section>

      {/* 🌟 최근 현황 리스트 */}
      <div className="mt-2 grid grid-cols-1 gap-6 lg:grid-cols-3">
        
        {/* 최근 발주 */}
        <div className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-end justify-between border-b border-border pb-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><span className="h-2 w-2 rounded-full bg-blue-500"></span>최근 발주 현황</h2>
            <Link href="/purchase-orders" className="text-[10px] font-medium text-muted-foreground hover:text-primary underline">전체보기 →</Link>
          </div>
          <div className="space-y-2 flex-1">
            {data.purchaseOrders.length === 0 ? <p className="py-4 text-center text-xs font-bold text-muted-foreground">데이터가 없습니다.</p> : 
              data.purchaseOrders.map((po) => (
                <Link key={po.id} href={`/purchase-orders/${po.id}`} className="flex justify-between items-center rounded-xl border border-transparent p-3 transition-all hover:border-border hover:bg-muted/50">
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="truncate text-xs font-black text-foreground">{po.po_no}</p>
                    <p className="mt-0.5 truncate text-[10px] font-bold text-muted-foreground">{po.customers?.customer_name ?? '알 수 없음'} | {po.po_date}</p>
                  </div>
                  <div>{getPurchaseBadge(po.status)}</div>
                </Link>
              ))
            }
          </div>
        </div>

        {/* 최근 생산지시 */}
        <div className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-end justify-between border-b border-border pb-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><span className="h-2 w-2 rounded-full bg-green-500"></span>최근 생산 지시</h2>
            <Link href="/production-orders" className="text-[10px] font-medium text-muted-foreground hover:text-primary underline">전체보기 →</Link>
          </div>
          <div className="space-y-2 flex-1">
            {data.productionOrders.length === 0 ? <p className="py-4 text-center text-xs font-bold text-muted-foreground">데이터가 없습니다.</p> : 
              data.productionOrders.map((order) => (
                <Link key={order.id} href={`/production-orders/${order.id}`} className="flex justify-between items-center rounded-xl border border-transparent p-3 transition-all hover:border-border hover:bg-muted/50">
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="truncate text-xs font-black text-foreground">{order.prod_no}</p>
                    <p className="mt-0.5 truncate text-[10px] font-bold text-muted-foreground">{order.items?.item_name ?? '-'} | {order.prod_date}</p>
                  </div>
                  <div>{getProductionBadge(order.status)}</div>
                </Link>
              ))
            }
          </div>
        </div>

        {/* 최근 결재문서 */}
        <div className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-end justify-between border-b border-border pb-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><span className="h-2 w-2 rounded-full bg-orange-500"></span>최근 결재 문서</h2>
            <Link href="/approvals" className="text-[10px] font-medium text-muted-foreground hover:text-primary underline">전체보기 →</Link>
          </div>
          <div className="space-y-2 flex-1">
            {data.approvals.length === 0 ? <p className="py-4 text-center text-xs font-bold text-muted-foreground">데이터가 없습니다.</p> : 
              data.approvals.map((doc) => {
                const statusPresentation = getApprovalDocDetailedStatusPresentation(
                  doc as unknown as ApprovalDocLike,
                  null
                )
                return (
                  <a
                    key={doc.id}
                    href={getDocDetailOpenHref(
                      doc as unknown as ApprovalDocLike & { id: number; writer_id?: string | null },
                      dashboardUserId
                    )}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                      if (e.button !== 0) return;
                      e.preventDefault();
                      openApprovalDocFromInbox(
                        doc as unknown as ApprovalDocLike & { id: number; writer_id?: string | null },
                        dashboardUserId
                      );
                    }}
                    className="flex justify-between items-center rounded-xl border border-transparent p-3 transition-all hover:border-border hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="truncate text-[10px] font-bold text-muted-foreground">{doc.doc_no}</p>
                      <p className="mt-0.5 truncate text-xs font-black text-foreground">{doc.title}</p>
                    </div>
                    <div className="flex flex-shrink-0 flex-wrap justify-end gap-1">
                      {statusPresentation.badges.map((b, i) => (
                        <span key={i} className={b.className}>
                          {b.label}
                        </span>
                      ))}
                    </div>
                  </a>
                )
              })
            }
          </div>
        </div>

      </div>
      
    </div>
  );
}