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
  // 💡 신규 작성, 상세 페이지와 동일한 안전한 연결 방식으로 통일
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

  useEffect(() => {
    async function loadData() {
      if (!supabase) return;
      setIsLoading(true);
      setErrorMessage('');

      try {
        // 1. 출고요청서 데이터 가져오기
        const { data: requestData, error: requestError } = await supabase
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

        if (requestError) {
          throw requestError;
        }

        // 2. 사용자 및 거래처 데이터는 실패해도 화면이 깨지지 않도록 별도 호출
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
            출고요청 문서를 조회하고 승인 전후 상태를 확인합니다.
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
                  <td colSpan={9} className="px-5 py-14 text-center text-sm text-gray-400">
                    출고요청서 데이터를 불러오는 중입니다...
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-14 text-center text-sm text-gray-400">
                    출고요청서 데이터가 없습니다. (데이터가 안 보인다면 DB의 RLS 설정을 확인해주세요)
                  </td>
                </tr>
              ) : (
                requests.map((request) => (
                  <tr key={request.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4 font-medium">
                      <Link
                        href={`/outbound-requests/${request.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {/* 💡 아직 DB에서 req_no를 생성하지 않았다면 '임시번호'를 띄워줍니다 */}
                        {request.req_no || `REQ-${request.id}`}
                      </Link>
                    </td>
                    <td className="px-5 py-4">{request.req_date}</td>
                    <td className="px-5 py-4">
                      {requesterMap.get(request.requester_id) ?? '-'}
                    </td>
                    <td className="px-5 py-4">
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
                    <td className="px-5 py-4 text-gray-500">{request.approval_doc_id ?? '-'}</td>
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