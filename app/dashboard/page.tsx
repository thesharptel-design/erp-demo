'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getDocDetailHref } from '@/lib/approval-status';
import type { ApprovalDocLike } from '@/lib/approval-status';

// --- 타입 정의 ---
type ItemRow = { id: number; item_code: string; item_name: string; safety_stock_qty: number; };
type InventoryRow = { item_id: number; current_qty: number; available_qty?: number | null; quarantine_qty?: number | null; };
type ApprovalDocRow = {
  id: number;
  doc_no: string;
  title: string;
  status: string;
  drafted_at: string;
  doc_type: string | null;
  outbound_requests: { id: number }[] | { id: number } | null;
};
type ProductionOrderRow = { id: number; prod_no: string; status: string; prod_date: string; inbound_completed?: boolean; items: { item_name: string } | null; };
type PurchaseOrderRow = { id: number; po_no: string; status: string; po_date: string; remarks: string | null; customers: { customer_name: string } | null; };
type InventoryTransactionRow = { id: number; trans_type: string; trans_date: string; };
type QcRequestRow = { id: number; qc_type: 'raw_material' | 'sample' | 'final_product'; qc_status: 'requested' | 'received' | 'testing' | 'pass' | 'fail' | 'hold'; result_status: 'pending' | 'pass' | 'fail'; request_date: string; };
type WarehouseRow = { id: number; is_active: boolean; };
type CoaFileRow = { id: number; is_active: boolean; };
type LoginAuditRow = { success: boolean; login_at: string; };

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

const getApprovalBadge = (status: string) => {
  switch (status) {
    case 'draft': return <span className={getBadgeStyle('gray')}>임시저장</span>;
    case 'submitted': return <span className={getBadgeStyle('orange')}>상신</span>;
    case 'in_review': return <span className={getBadgeStyle('blue')}>결재중</span>;
    case 'approved': return <span className={getBadgeStyle('green')}>승인</span>;
    case 'rejected': return <span className={getBadgeStyle('red')}>반려</span>;
    default: return <span className={getBadgeStyle('gray')}>{status}</span>;
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
    items: [] as ItemRow[],
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

  useEffect(() => {
    async function loadData() {
      try {
        const [
          { data: itemsData }, { data: inventoryData }, { data: approvalsData },
          { data: productionOrdersData }, { data: purchaseOrdersData },
          { data: inventoryTransactionsData }, { data: qcRequestsData }, { data: warehouseData },
          { data: coaFileData }, { data: loginAuditData },
        ] = await Promise.all([
          supabase.from('items').select('id, item_code, item_name, safety_stock_qty').eq('is_active', true),
          supabase.from('inventory').select('item_id, current_qty, available_qty, quarantine_qty'),
          supabase.from('approval_docs').select('id, doc_no, title, status, drafted_at, doc_type, outbound_requests(id)').order('id', { ascending: false }).limit(5),
          supabase.from('production_orders').select(`id, prod_no, status, prod_date, inbound_completed, items:item_id(item_name)`).order('id', { ascending: false }).limit(5),
          supabase.from('purchase_orders').select(`id, po_no, status, po_date, remarks, customers:customer_id(customer_name)`).order('id', { ascending: false }).limit(5),
          supabase.from('inventory_transactions').select('id, trans_type, trans_date').order('id', { ascending: false }),
          supabase.from('qc_requests').select('id, qc_type, qc_status, result_status, request_date').order('id', { ascending: false }),
          supabase.from('warehouses').select('id, is_active'),
          supabase.from('coa_files').select('id, is_active'),
          supabase.from('login_audit_logs').select('success, login_at').order('login_at', { ascending: false }).limit(100),
        ]);

        setData({
          items: (itemsData as ItemRow[]) || [],
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
  const inventoryMap = new Map(data.inventory.map((row) => [row.item_id, { availableQty: Number(row.available_qty ?? 0) }]));
  
  const shortageCount = data.items.filter((item) => (inventoryMap.get(item.id)?.availableQty ?? 0) < Number(item.safety_stock_qty ?? 0)).length;
  const quarantineCount = data.inventory.filter((row) => Number(row.quarantine_qty ?? 0) > 0).length;
  const pendingApprovalCount = data.approvals.filter((doc) => ['submitted', 'in_review'].includes(doc.status)).length;
  const pendingOutboundRequestCount = data.approvals.filter((doc) => doc.doc_type === 'outbound_request' && ['submitted', 'in_review'].includes(doc.status)).length;
  const pendingQcCount = data.qcRequests.filter((qc) => ['requested', 'received', 'testing', 'hold'].includes(qc.qc_status)).length;
  const pendingProdInboundCount = data.productionOrders.filter((order) => order.status === 'completed' && !order.inbound_completed).length;
  const activeWarehouseCount = data.warehouses.filter((wh) => wh.is_active).length;
  const activeCoaCount = data.coaFiles.filter((file) => file.is_active).length;

  // 한국 시간(KST) 기준으로 오늘 날짜 구하기
  const today = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const todayInboundCount = data.inventoryTransactions.filter((tx) => tx.trans_date.slice(0, 10) === today && ['IN', 'PROD_IN', 'QC_RELEASE'].includes(tx.trans_type)).length;
  const todayLoginFailCount = data.loginAudits.filter((log) => !log.success && log.login_at.slice(0, 10) === today).length;

  return (
    <div className="p-6 max-w-[1600px] mx-auto font-sans bg-gray-50 min-h-screen space-y-6">
      
      {/* 🌟 헤더 영역 */}
      <header className="mb-8">
        <h1 className="text-4xl font-black uppercase tracking-tighter text-gray-900 italic">
          BIO<span className="text-blue-600">-ERP</span> DASHBOARD
        </h1>
        <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-1">
          Integrated Management System Overview
        </p>
      </header>

      {/* 🌟 요약 통계 카드 (브루탈리즘 스타일 적용) */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-8 gap-4">
        {[
          { title: '부족 품목', count: shortageCount, desc: '안전재고 미만', color: 'text-red-600', bg: 'bg-red-50' },
          { title: '격리 재고', count: quarantineCount, desc: 'QC 해제 대기', color: 'text-orange-600', bg: 'bg-orange-50' },
          { title: '미결재 문서', count: pendingApprovalCount, desc: '상신/결재중', color: 'text-blue-600', bg: 'bg-blue-50' },
          { title: '출고요청 대기', count: pendingOutboundRequestCount, desc: '출고요청 결재중', color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { title: 'QC 대기', count: pendingQcCount, desc: '시험/보류 중', color: 'text-purple-600', bg: 'bg-purple-50' },
          { title: '생산완료 미입고', count: pendingProdInboundCount, desc: '입고 대기 상태', color: 'text-pink-600', bg: 'bg-pink-50' },
          { title: '활성 창고', count: activeWarehouseCount, desc: '창고 플랫폼 운영수', color: 'text-cyan-700', bg: 'bg-cyan-50' },
          { title: '활성 CoA', count: activeCoaCount, desc: '다운로드 가능 문서', color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { title: '금일 입고/반영', count: todayInboundCount, desc: '오늘 반영된 수량', color: 'text-green-600', bg: 'bg-green-50' },
          { title: '금일 로그인 실패', count: todayLoginFailCount, desc: '감사 모니터링', color: 'text-rose-700', bg: 'bg-rose-50' },
        ].map((stat, i) => (
          <div key={i} className={`p-5 rounded-2xl border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-white flex flex-col justify-between hover:-translate-y-1 transition-transform`}>
            <p className="text-[11px] font-black text-gray-500 uppercase">{stat.title}</p>
            <p className={`mt-2 text-4xl font-black tracking-tighter ${stat.color}`}>{stat.count}</p>
            <p className="mt-3 text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-md inline-block self-start">{stat.desc}</p>
          </div>
        ))}
      </div>

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
              data.approvals.map((doc) => (
                <Link key={doc.id} href={getDocDetailHref(doc as unknown as ApprovalDocLike & { id: number })} className="flex justify-between items-center p-3 rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all">
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="text-[10px] font-bold text-gray-400 truncate">{doc.doc_no}</p>
                    <p className="text-xs font-black text-gray-900 mt-0.5 truncate">{doc.title}</p>
                  </div>
                  <div>{getApprovalBadge(doc.status)}</div>
                </Link>
              ))
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
            { name: '로그인 감사 모니터', path: '/admin/login-audit', icon: '🛡️' },
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