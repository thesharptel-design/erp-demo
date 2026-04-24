'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { openApprovalDocFromInbox } from '@/lib/approval-popup';
import { getApprovalDocDetailedStatusPresentation, getDocDetailOpenHref } from '@/lib/approval-status';
import type { ApprovalDocLike } from '@/lib/approval-status';

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
type CalendarCell = { day: number; isCurrentMonth: boolean; isToday: boolean; };

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
  const [dashboardUserId, setDashboardUserId] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setDashboardUserId(user?.id ?? null);

        const [
          { data: inventoryData }, { data: approvalsData },
          { data: productionOrdersData }, { data: purchaseOrdersData },
          { data: inventoryTransactionsData }, { data: qcRequestsData }, { data: warehouseData },
          { data: coaFileData }, { data: loginAuditData },
        ] = await Promise.all([
          supabase.from('inventory').select('item_id, current_qty, available_qty, quarantine_qty'),
          supabase
            .from('approval_docs')
            .select('id, doc_no, title, status, remarks, current_line_no, drafted_at, doc_type, writer_id, outbound_requests(id)')
            .order('id', { ascending: false })
            .limit(5),
          supabase.from('production_orders').select(`id, prod_no, status, prod_date, inbound_completed, items:item_id(item_name)`).order('id', { ascending: false }).limit(5),
          supabase.from('purchase_orders').select(`id, po_no, status, po_date, remarks, customers:customer_id(customer_name)`).order('id', { ascending: false }).limit(5),
          supabase.from('inventory_transactions').select('id, trans_type, trans_date').order('id', { ascending: false }),
          supabase.from('qc_requests').select('id, qc_type, qc_status, result_status, request_date').order('id', { ascending: false }),
          supabase.from('warehouses').select('id, is_active'),
          supabase.from('coa_files').select('id, is_active'),
          supabase.from('login_audit_logs').select('success, login_at').order('login_at', { ascending: false }).limit(100),
        ]);

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

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-gray-50"><div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>;

  // --- 데이터 집계 로직 ---
  const pendingApprovalCount = data.approvals.filter((doc) => ['submitted', 'in_review'].includes(doc.status)).length;
  const pendingQcCount = data.qcRequests.filter((qc) => ['requested', 'received', 'testing', 'hold'].includes(qc.qc_status)).length;

  // 한국 시간(KST) 기준으로 오늘 날짜 구하기
  const today = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const todayLoginFailCount = data.loginAudits.filter((log) => !log.success && log.login_at.slice(0, 10) === today).length;
  const monthKorean = new Intl.DateTimeFormat('ko-KR', { month: 'long' }).format(new Date(`${today}T00:00:00`));
  const [currentYear, currentMonth, currentDate] = today.split('-').map(Number);
  const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const prevMonthDays = new Date(currentYear, currentMonth - 1, 0).getDate();
  const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];
  const calendarCells: CalendarCell[] = [];

  for (let idx = 0; idx < 42; idx += 1) {
    if (idx < firstDayOfMonth) {
      calendarCells.push({
        day: prevMonthDays - firstDayOfMonth + idx + 1,
        isCurrentMonth: false,
        isToday: false,
      });
      continue;
    }

    const day = idx - firstDayOfMonth + 1;
    if (day <= daysInMonth) {
      calendarCells.push({
        day,
        isCurrentMonth: true,
        isToday: day === currentDate,
      });
      continue;
    }

    calendarCells.push({
      day: day - daysInMonth,
      isCurrentMonth: false,
      isToday: false,
    });
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto font-sans bg-gray-50 min-h-screen space-y-6">
      
      {/* 🌟 헤더 영역 */}
      <header className="mb-8">
        <h1 className="text-4xl font-black uppercase tracking-tighter text-gray-900 italic">
          <span className="text-blue-600">DASHBOARD</span> 
        </h1>
        <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-1">
          Integrated Management System Overview
        </p>
      </header>

      {/* 임시 대시보드 위젯: 달력 + 오늘 브리핑 */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white border-2 border-black rounded-2xl p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-end justify-between mb-4">
            <h2 className="text-base font-black">📅 {currentYear}년 {monthKorean} 캘린더</h2>
            <p className="text-[11px] font-bold text-gray-400">임시 위젯</p>
          </div>
          <div className="grid grid-cols-7 gap-2 text-center mb-2">
            {weekdayLabels.map((label) => (
              <div key={label} className={`text-[11px] font-black ${label === '일' ? 'text-rose-500' : label === '토' ? 'text-blue-500' : 'text-gray-500'}`}>
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {calendarCells.map((cell, index) => (
              <div
                key={`${cell.day}-${index}`}
                className={`h-12 rounded-xl border text-sm font-bold flex items-center justify-center transition-colors ${
                  cell.isToday
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : cell.isCurrentMonth
                      ? 'bg-gray-50 border-gray-200 text-gray-800'
                      : 'bg-white border-gray-100 text-gray-300'
                }`}
              >
                {cell.day}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-6 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <h2 className="text-base font-black">✨ 오늘 브리핑</h2>
          <p className="mt-1 text-[11px] font-bold text-slate-300">사진 대신 넣은 임시 요약 카드</p>
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2">
              <span className="text-xs font-bold text-slate-200">결재 대기</span>
              <span className="text-lg font-black text-amber-300">{pendingApprovalCount}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2">
              <span className="text-xs font-bold text-slate-200">QC 이슈</span>
              <span className="text-lg font-black text-purple-300">{pendingQcCount}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2">
              <span className="text-xs font-bold text-slate-200">로그인 실패</span>
              <span className={`text-lg font-black ${todayLoginFailCount > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                {todayLoginFailCount}
              </span>
            </div>
          </div>
          <Link
            href="/approvals"
            className="mt-5 inline-flex items-center rounded-xl bg-blue-500 hover:bg-blue-400 px-3 py-2 text-xs font-black transition-colors"
          >
            결재함 바로가기 →
          </Link>
        </div>
      </section>

      {/* 🌟 최근 현황 리스트 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        
        {/* 최근 발주 */}
        <div className="bg-white border-2 border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col">
          <div className="flex justify-between items-end mb-4 border-b-2 border-gray-100 pb-3">
            <h2 className="text-sm font-black flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500"></span>최근 발주 현황</h2>
            <Link href="/purchase-orders" className="text-[10px] font-bold text-gray-400 hover:text-blue-600 underline">전체보기 →</Link>
          </div>
          <div className="space-y-2 flex-1">
            {data.purchaseOrders.length === 0 ? <p className="text-xs text-gray-400 font-bold py-4 text-center">데이터가 없습니다.</p> : 
              data.purchaseOrders.map((po) => (
                <Link key={po.id} href={`/purchase-orders/${po.id}`} className="flex justify-between items-center p-3 rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all">
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="text-xs font-black text-gray-900 truncate">{po.po_no}</p>
                    <p className="text-[10px] font-bold text-gray-400 mt-0.5 truncate">{po.customers?.customer_name ?? '알 수 없음'} | {po.po_date}</p>
                  </div>
                  <div>{getPurchaseBadge(po.status)}</div>
                </Link>
              ))
            }
          </div>
        </div>

        {/* 최근 생산지시 */}
        <div className="bg-white border-2 border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col">
          <div className="flex justify-between items-end mb-4 border-b-2 border-gray-100 pb-3">
            <h2 className="text-sm font-black flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500"></span>최근 생산 지시</h2>
            <Link href="/production-orders" className="text-[10px] font-bold text-gray-400 hover:text-blue-600 underline">전체보기 →</Link>
          </div>
          <div className="space-y-2 flex-1">
            {data.productionOrders.length === 0 ? <p className="text-xs text-gray-400 font-bold py-4 text-center">데이터가 없습니다.</p> : 
              data.productionOrders.map((order) => (
                <Link key={order.id} href={`/production-orders/${order.id}`} className="flex justify-between items-center p-3 rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all">
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="text-xs font-black text-gray-900 truncate">{order.prod_no}</p>
                    <p className="text-[10px] font-bold text-gray-400 mt-0.5 truncate">{order.items?.item_name ?? '-'} | {order.prod_date}</p>
                  </div>
                  <div>{getProductionBadge(order.status)}</div>
                </Link>
              ))
            }
          </div>
        </div>

        {/* 최근 결재문서 */}
        <div className="bg-white border-2 border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col">
          <div className="flex justify-between items-end mb-4 border-b-2 border-gray-100 pb-3">
            <h2 className="text-sm font-black flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-orange-500"></span>최근 결재 문서</h2>
            <Link href="/approvals" className="text-[10px] font-bold text-gray-400 hover:text-blue-600 underline">전체보기 →</Link>
          </div>
          <div className="space-y-2 flex-1">
            {data.approvals.length === 0 ? <p className="text-xs text-gray-400 font-bold py-4 text-center">데이터가 없습니다.</p> : 
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
                    className="flex justify-between items-center p-3 rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="text-[10px] font-bold text-gray-400 truncate">{doc.doc_no}</p>
                      <p className="text-xs font-black text-gray-900 mt-0.5 truncate">{doc.title}</p>
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

      {/* 🌟 빠른 이동 (현재 사이드바 구조 완벽 동기화) */}
      <div className="bg-white border-2 border-black rounded-2xl p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mt-8">
        <div className="mb-4">
          <h2 className="text-base font-black flex items-center gap-2">🚀 QUICK LINKS <span className="text-[10px] font-bold text-gray-400 ml-2 bg-gray-100 px-2 py-1 rounded">빠른 메뉴 이동</span></h2>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            { name: '견적서 관리', path: '/quotes', icon: '📝' },
            { name: '수주/발주 관리', path: '/purchase-orders', icon: '🛒' },
            { name: '생산지시/BOM', path: '/production-orders', icon: '⚙️' },
            { name: 'QC 대기/내역', path: '/qc', icon: '🔬' },
            { name: '재고/입출고 현황', path: '/inventory', icon: '📦' },
            { name: '출고 지시 처리', path: '/outbound-instructions', icon: '📋' },
            { name: '자재 입/출고 등록', path: '/inbound/new', icon: '📥' },
            { name: '거래처 마스터', path: '/customers', icon: '🏢' },
            { name: '품목 마스터', path: '/items', icon: '🏷️' },
            { name: '사용자 권한 관리', path: '/admin/user-permissions', icon: '🔑' },
            { name: '로그인 모니터', path: '/admin/login-audit', icon: '🛡️' },
            { name: '창고 관리', path: '/admin/warehouses', icon: '🏭' },
            { name: 'CoA 파일 관리', path: '/admin/coa-files', icon: '📎' },
            { name: '결재 문서함', path: '/approvals', icon: '✅' },
          ].map((link, idx) => (
            <Link 
              key={idx} 
              href={link.path} 
              className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-gray-100 hover:border-blue-600 hover:bg-blue-50 transition-all group"
            >
              <span className="text-2xl mb-2 group-hover:scale-110 transition-transform">{link.icon}</span>
              <span className="text-[11px] font-black text-gray-600 group-hover:text-blue-700 text-center">{link.name}</span>
            </Link>
          ))}
        </div>
      </div>
      
    </div>
  );
}