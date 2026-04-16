'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from "@supabase/supabase-js"

type OutboundRequestRow = {
  id: number
  req_no: string | null
  req_date: string
  requester_id: string
  customer_id: number | null
  purpose: string | null
  remarks: string | null
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'completed'
  approval_doc_id: number | null
  outbound_completed: boolean
  created_at: string
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

function getStatusLabel(status: OutboundRequestRow['status']) {
  switch (status) {
    case 'draft': return '작성중'
    case 'submitted': return '상신'
    case 'approved': return '승인완료'
    case 'rejected': return '반려'
    case 'completed': return '출고완료'
    default: return status
  }
}

function getStatusStyle(status: OutboundRequestRow['status']) {
  switch (status) {
    case 'draft': return 'erp-badge erp-badge-draft'
    case 'submitted': return 'erp-badge erp-badge-progress'
    case 'approved': return 'erp-badge erp-badge-review'
    case 'rejected': return 'erp-badge erp-badge-danger'
    case 'completed': return 'erp-badge erp-badge-done'
    default: return 'erp-badge erp-badge-draft'
  }
}

function getOutboundCompletedLabel(completed: boolean) {
  return completed ? '완료' : '미완료'
}

function getOutboundCompletedStyle(completed: boolean) {
  return completed
    ? 'erp-badge erp-badge-done'
    : 'erp-badge erp-badge-draft'
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
  
  // 🌟 추가: 현재 사용자가 관리자인지 확인하기 위한 상태
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    async function loadData() {
      if (!supabase) return;
      setIsLoading(true);
      setErrorMessage('');

      try {
        // 🌟 1. 현재 로그인한 사용자 확인
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setRequests([]);
          setIsLoading(false);
          return;
        }

        // 🌟 2. 사용자 역할(관리자 여부) 확인
        const { data: profile } = await supabase
          .from('app_users')
          .select('role_name')
          .eq('id', user.id)
          .single();
          
        const userIsAdmin = profile?.role_name === 'admin';
        setIsAdmin(userIsAdmin);

        // 🌟 3. 내가 결재선에 포함된 문서 ID 찾기 (관리자가 아닐 때만)
        let myDocIds: number[] = [];
        if (!userIsAdmin) {
          const { data: lines } = await supabase
            .from('approval_lines')
            .select('approval_doc_id')
            .eq('approver_id', user.id);
          
          // null 값 제거 후 숫자 배열로 추출
          myDocIds = lines?.map(line => line.approval_doc_id).filter(id => id !== null) as number[] || [];
        }

        // 🌟 4. 출고요청서 메인 쿼리 작성
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
            created_at
          `)
          .order('id', { ascending: false });

        // 🌟 5. 철통 보안 권한 필터링 적용!
        if (!userIsAdmin) {
          if (myDocIds.length > 0) {
            // 내가 기안했거나, 내가 결재해야 할 문서만
            query = query.or(`requester_id.eq.${user.id},approval_doc_id.in.(${myDocIds.join(',')})`);
          } else {
            // 결재할 건 없고 내가 기안한 문서만
            query = query.eq('requester_id', user.id);
          }
        }

        const { data: requestData, error: requestError } = await query;

        if (requestError) {
          throw requestError;
        }

        // 사용자 및 거래처 데이터 가져오기
        const { data: usersData } = await supabase
          .from('app_users')
          .select('id, user_name, login_id')
          .order('user_name');

        const { data: customersData } = await supabase
          .from('customers')
          .select('id, customer_name')
          .order('customer_name');

        setRequests((requestData as OutboundRequestRow[]) ?? []);
        setUsers((usersData as AppUserRow[]) ?? []);
        setCustomers((customersData as CustomerRow[]) ?? []);

      } catch (error: any) {
        console.error('outbound requests load error:', error);
        setErrorMessage('출고요청서 데이터를 불러오지 못했습니다.');
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">출고요청서</h1>
          <p className="mt-1 text-sm text-gray-500">
            {isAdmin 
              ? '모든 출고요청 문서를 조회하고 승인 전후 상태를 확인합니다. (최고관리자 모드)' 
              : '내가 작성했거나 결재해야 할 출고요청 문서만 표시됩니다.'}
          </p>
        </div>

        <Link href="/outbound-requests/new" className="erp-btn-primary">
          출고요청서 작성
        </Link>
      </div>

      {errorMessage && <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-200">{errorMessage}</div>}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1200px] w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-4">요청번호</th>
                <th className="px-5 py-4">요청일</th>
                <th className="px-5 py-4">요청자</th>
                <th className="px-5 py-4">거래처</th>
                <th className="px-5 py-4">출고목적</th>
                <th className="px-5 py-4">상태</th>
                <th className="px-5 py-4">출고처리</th>
                <th className="px-5 py-4">결재문서ID</th>
                <th className="px-5 py-4">비고</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-5 py-14 text-center text-sm font-bold text-gray-400">
                    출고요청서 데이터를 불러오는 중입니다...
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-14 text-center text-sm font-bold text-gray-400">
                    권한이 있는 출고요청서 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                requests.map((request) => (
                  <tr key={request.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4 font-bold text-blue-600">
                      <Link
                        href={`/outbound-requests/${request.id}`}
                        className="hover:underline"
                      >
                        {request.req_no || `REQ-${request.id}`}
                      </Link>
                    </td>
                    <td className="px-5 py-4 font-medium">{request.req_date}</td>
                    <td className="px-5 py-4 font-medium text-gray-900">
                      {requesterMap.get(request.requester_id) ?? '-'}
                    </td>
                    <td className="px-5 py-4 font-medium">
                      {request.customer_id
                        ? customerMap.get(request.customer_id) ?? '-'
                        : '-'}
                    </td>
                    <td className="px-5 py-4 whitespace-pre-wrap break-words">
                      {request.purpose ?? '-'}
                    </td>
                    <td className="px-5 py-4">
                      <span className={getStatusStyle(request.status)}>
                        {getStatusLabel(request.status)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={getOutboundCompletedStyle(request.outbound_completed)}>
                        {getOutboundCompletedLabel(request.outbound_completed)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-400 font-medium">{request.approval_doc_id ?? '-'}</td>
                    <td className="px-5 py-4 whitespace-pre-wrap break-words text-gray-500">
                      {request.remarks ?? '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}