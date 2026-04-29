'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { getOutboundRequestRowPresentation } from '@/lib/approval-status'
import type { ApprovalDocLike, ApprovalLineLike } from '@/lib/approval-status'
import { openApprovalShellPopup, openOutboundRequestDetailViewPopup } from '@/lib/approval-popup'
import {
  hasOutboundPermission,
  isSystemAdminUser,
  type CurrentUserPermissions,
} from '@/lib/permissions'

type OutboundRequestRow = Database['public']['Tables']['outbound_requests']['Row'] & {
  approval_doc?: (ApprovalDocLike & { approval_lines?: ApprovalLineLike[] }) | null
  warehouses?: { name: string | null } | null
}

type AppUserRow = {
  id: string
  user_name: string
  login_id: string | null
}

type CustomerRow = {
  id: number
  customer_name: string
}

export default function OutboundRequestsPage() {
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return null;
    return createClient(url, anonKey);
  }, []);

  const [requests, setRequests] = useState<OutboundRequestRow[]>([])
  const [users, setUsers] = useState<AppUserRow[]>([])
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [isPermissionDenied, setIsPermissionDenied] = useState(false)
  
  const [isAdmin, setIsAdmin] = useState(false)
  const [canOutboundView, setCanOutboundView] = useState(false)

  useEffect(() => {
    async function loadData() {
      if (!supabase) return;
      setIsLoading(true);
      setErrorMessage('');

      try {
        setIsPermissionDenied(false)
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setRequests([]);
          setIsLoading(false);
          return;
        }

        const { data: profile } = await supabase
          .from('app_users')
          .select(`
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
          .eq('id', user.id)
          .single();

        const userIsAdmin = isSystemAdminUser(
          profile as Pick<CurrentUserPermissions, 'role_name' | 'can_manage_permissions' | 'can_admin_manage'> | null
        );
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
        setIsAdmin(userIsAdmin);
        setCanOutboundView(userCanOutboundView);

        if (!userCanOutboundView) {
          setRequests([]);
          setUsers([]);
          setCustomers([]);
          setIsPermissionDenied(true);
          setErrorMessage('출고요청 조회 권한이 없습니다. 관리자에게 출고권한(조회)을 요청해 주세요.');
          return;
        }

        // 🌟 [오류 수정 완료] approval_lines를 approval_doc 안에 중첩해서 올바르게 가져옵니다!
        let query = supabase
          .from('outbound_requests')
          .select(`
            id,
            req_no,
            req_date,
            requester_id,
            customer_id,
            purpose,
            remarks,
            status,
            approval_doc_id,
            outbound_completed,
            dispatch_state,
            dispatch_handler_name,
            created_at,
            approval_doc:approval_docs (
              status, 
              remarks,
              approval_lines (
                approver_role, 
                status, 
                line_no
              )
            ),
            warehouses:warehouse_id(name)
          `)
          .order('id', { ascending: false });

        const { data: requestData, error: requestError } = await query;

        if (requestError) {
          throw requestError;
        }

        const { data: usersData } = await supabase
          .from('app_users')
          .select('id, user_name, login_id')
          .order('user_name');

        const { data: customersData } = await supabase
          .from('customers')
          .select('id, customer_name')
          .order('customer_name');

        setRequests(((requestData ?? []) as unknown) as OutboundRequestRow[]);
        setUsers((usersData as AppUserRow[]) ?? []);
        setCustomers((customersData as CustomerRow[]) ?? []);

      } catch (error: unknown) {
        console.error('outbound requests load error:', error);
        const msg = error instanceof Error ? error.message : String(error);
        setErrorMessage(`출고요청서 데이터를 불러오지 못했습니다: ${msg}`);
      } finally {
        setIsLoading(false);
      }
    }

    loadData()
  }, [supabase])

  const requesterMap = useMemo(() => {
    return new Map(
      users.map((user) => [
        user.id,
        user.login_id ? `${user.user_name} / ${user.login_id}` : user.user_name,
      ])
    )
  }, [users])

  const customerMap = useMemo(() => {
    return new Map(customers.map((customer) => [customer.id, customer.customer_name]))
  }, [customers])

  const openOutboundDraftPopup = useCallback(() => {
    openApprovalShellPopup('/outbound-requests/new', 'outboundRequestDraftPopup')
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-900">출고요청 조회</h1>
          <p className="mt-2 text-sm font-bold text-gray-500">
            {isAdmin 
              ? '전체 요청 조회 (관리자 모드)' 
              : '내 요청/결재 대상만 표시'}
          </p>
        </div>

        <button
          type="button"
          onClick={openOutboundDraftPopup}
          disabled={!canOutboundView}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-black hover:bg-blue-700 transition-colors shadow-sm text-sm"
        >
          + 요청 작성
        </button>
      </div>

      {isPermissionDenied ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6 shadow-sm">
          <h2 className="text-base sm:text-lg font-black text-amber-900">조회 권한 없음</h2>
          <p className="mt-3 text-sm sm:text-base font-bold leading-relaxed text-amber-800">
            출고권한(조회) 미부여 상태입니다.
            관리자에게 권한 부여를 요청해 주세요.
          </p>
        </div>
      ) : null}
      {!isPermissionDenied && errorMessage ? (
        <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-200 font-bold">{errorMessage}</div>
      ) : null}

      <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1200px] w-full text-sm whitespace-nowrap text-left">
            <thead className="bg-gray-50 border-b border-gray-100 text-gray-500">
              <tr>
                <th className="px-5 py-4 font-bold">요청번호</th>
                <th className="px-5 py-4 font-bold">진행상태</th>
                <th className="px-5 py-4 font-bold">출고통제</th>
                <th className="px-5 py-4 font-bold">담당자</th>
                <th className="px-5 py-4 font-bold">요청일</th>
                <th className="px-5 py-4 font-bold">요청자</th>
                <th className="px-5 py-4 font-bold">창고</th>
                <th className="px-5 py-4 font-bold">거래처</th>
                <th className="px-5 py-4 font-bold max-w-[200px]">목적</th>
                <th className="px-5 py-4 font-bold">사유/메모</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-5 py-16 text-center font-bold text-gray-400">
                    출고요청 데이터 불러오는 중...
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-5 py-16 text-center font-bold text-gray-400">
                    조회 가능한 출고요청이 없습니다.
                  </td>
                </tr>
              ) : (
                requests.map((request) => {
                  // 🌟 결재선 데이터를 안전하게 매핑합니다
                  const lines = request.approval_doc?.approval_lines ?? [];
                  const statusInfo = getOutboundRequestRowPresentation({
                    approvalDoc: request.approval_doc,
                    lines,
                    reqStatus: request.status,
                    dispatchState: request.dispatch_state,
                  });

                  return (
                    <tr key={request.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4">
                        <a
                          href={`/outbound-requests/view/${request.id}`}
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                            if (e.button !== 0) return
                            e.preventDefault()
                            openOutboundRequestDetailViewPopup(request.id)
                          }}
                          className="font-black text-blue-600 hover:text-blue-800 transition-colors"
                        >
                          {request.req_no || `REQ-${request.id}`}
                        </a>
                      </td>
                      <td className="px-5 py-4">
                        <span className={statusInfo.className}>{statusInfo.label}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700">
                          {request.dispatch_state === 'assigned'
                            ? '담당자 지정'
                            : request.dispatch_state === 'in_progress'
                            ? '처리중'
                            : request.dispatch_state === 'completed'
                            ? '완료'
                            : '지시 대기'}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-bold text-gray-900">
                        {request.dispatch_handler_name ?? <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-5 py-4 font-bold text-gray-600">{request.req_date}</td>
                      <td className="px-5 py-4 font-bold text-gray-900">
                        {requesterMap.get(request.requester_id) ?? '-'}
                      </td>
                      <td className="px-5 py-4 font-bold text-gray-700">{request.warehouses?.name ?? '-'}</td>
                      <td className="px-5 py-4 font-bold text-blue-800">
                        {request.customer_id
                          ? customerMap.get(request.customer_id) ?? '-'
                          : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-5 py-4">
                        <div className="max-w-[250px] truncate font-medium text-gray-700" title={request.purpose ?? ''}>
                          {request.purpose ?? '-'}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="max-w-[250px] truncate text-xs font-bold text-gray-400" title={request.approval_doc?.remarks || request.remarks || ''}>
                          {request.approval_doc?.remarks || request.remarks || '-'}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}