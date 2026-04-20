import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateNextDroDocNo } from '@/lib/approval-doc-no'
import { hasManagePermission } from '@/lib/permissions'

type SubmitRequestBody = {
  outbound_request_id: number
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: '서버 환경변수가 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json(
        { error: '인증 정보가 없습니다.' },
        { status: 401 }
      )
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const jwt = authHeader.replace('Bearer ', '')

    const {
      data: { user: currentUser },
      error: currentUserError,
    } = await adminClient.auth.getUser(jwt)

    if (currentUserError || !currentUser?.email) {
      return NextResponse.json(
        { error: '현재 사용자 인증을 확인할 수 없습니다.' },
        { status: 401 }
      )
    }

    const { data: currentAppUser, error: currentAppUserError } = await adminClient
      .from('app_users')
      .select('id, role_name, can_material_manage, can_manage_permissions, can_receive_stock, is_active')
      .eq('email', currentUser.email)
      .single()

    if (currentAppUserError || !currentAppUser || !currentAppUser.is_active) {
      return NextResponse.json(
        { error: '현재 사용자 정보를 확인할 수 없습니다.' },
        { status: 403 }
      )
    }
    if (!hasManagePermission(currentAppUser, 'can_material_manage')) {
      return NextResponse.json(
        { error: '출고요청 상신 권한이 없습니다.' },
        { status: 403 }
      )
    }

    const body = (await request.json()) as SubmitRequestBody

    if (!body.outbound_request_id || Number(body.outbound_request_id) <= 0) {
      return NextResponse.json(
        { error: '출고요청서 ID가 올바르지 않습니다.' },
        { status: 400 }
      )
    }

    const requestId = Number(body.outbound_request_id)

    const { data: outboundRequest, error: outboundRequestError } = await adminClient
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
        outbound_completed
      `)
      .eq('id', requestId)
      .single()

    if (outboundRequestError || !outboundRequest) {
      return NextResponse.json(
        { error: '출고요청서를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    if (!['draft', 'rejected'].includes(outboundRequest.status)) {
      return NextResponse.json(
        { error: '현재 상태에서는 상신할 수 없습니다.' },
        { status: 400 }
      )
    }

    if (outboundRequest.approval_doc_id) {
      return NextResponse.json(
        { error: '이미 결재문서가 연결된 요청입니다.' },
        { status: 400 }
      )
    }

    const { data: requestItems, error: requestItemsError } = await adminClient
      .from('outbound_request_items')
      .select(`
        id,
        line_no,
        item_id,
        qty,
        remarks
      `)
      .eq('outbound_request_id', requestId)
      .order('line_no')

    if (requestItemsError) {
      return NextResponse.json(
        { error: '출고요청 품목행을 조회하지 못했습니다.' },
        { status: 500 }
      )
    }

    if (!requestItems || requestItems.length === 0) {
      return NextResponse.json(
        { error: '출고요청 품목행이 없습니다. 품목을 1개 이상 등록하십시오.' },
        { status: 400 }
      )
    }

    const { data: requesterUser, error: requesterUserError } = await adminClient
      .from('app_users')
      .select('id, user_name, login_id, dept_id')
      .eq('id', outboundRequest.requester_id)
      .single()

    if (requesterUserError || !requesterUser) {
      return NextResponse.json(
        { error: '요청자 정보를 찾을 수 없습니다.' },
        { status: 500 }
      )
    }

    if (requesterUser.dept_id === null || requesterUser.dept_id === undefined) {
      return NextResponse.json(
        { error: '요청자 부서 정보가 없어 결재문서를 생성할 수 없습니다.' },
        { status: 400 }
      )
    }

    let customerName = ''
    if (outboundRequest.customer_id) {
      const { data: customerRow } = await adminClient
        .from('customers')
        .select('customer_name')
        .eq('id', outboundRequest.customer_id)
        .maybeSingle()

      customerName = customerRow?.customer_name ?? ''
    }

    const itemIds = requestItems.map((row) => row.item_id)

    const { data: itemRows } = await adminClient
      .from('items')
      .select('id, item_code, item_name, unit')
      .in('id', itemIds)

    const itemMap = new Map(
      ((itemRows ?? []) as Array<{
        id: number
        item_code: string
        item_name: string
        unit: string | null
      }>).map((item) => [item.id, item])
    )

    const docNo = await generateNextDroDocNo(adminClient)
    const title = `[출고요청] ${docNo}`
    const now = new Date().toISOString()
    const draftedAt = now
    const submittedAt = now

    const itemSummary = requestItems
      .map((row, index) => {
        const item = itemMap.get(row.item_id)
        return `${index + 1}. ${item?.item_code ?? '-'} / ${item?.item_name ?? '-'} / 수량 ${row.qty}${item?.unit ? ` ${item.unit}` : ''}`
      })
      .join('\n')

    const content = [
      `출고요청번호: ${docNo}`,
      `요청일: ${outboundRequest.req_date}`,
      `요청자: ${requesterUser.user_name ?? '-'}${requesterUser.login_id ? ` / ${requesterUser.login_id}` : ''}`,
      `거래처: ${customerName || '-'}`,
      `출고목적: ${outboundRequest.purpose ?? '-'}`,
      `비고: ${outboundRequest.remarks ?? '-'}`,
      '',
      '[품목행]',
      itemSummary,
    ].join('\n')

    const { data: approvalDoc, error: approvalDocError } = await adminClient
      .from('approval_docs')
      .insert({
        doc_no: docNo,
        doc_type: 'outbound_request',
        title,
        content,
        writer_id: outboundRequest.requester_id,
        dept_id: requesterUser.dept_id,
        status: 'submitted',
        current_line_no: 1,
        drafted_at: draftedAt,
        submitted_at: submittedAt,
        remarks: outboundRequest.remarks ?? null,
      })
      .select('id')
      .single()

    if (approvalDocError || !approvalDoc) {
      return NextResponse.json(
        {
          error: `결재문서 생성 오류: ${approvalDocError?.message ?? '알 수 없는 오류'}`,
        },
        { status: 500 }
      )
    }

    const { error: updateOutboundError } = await adminClient
      .from('outbound_requests')
      .update({
        status: 'submitted',
        approval_doc_id: approvalDoc.id,
        req_no: docNo,
      })
      .eq('id', outboundRequest.id)

    if (updateOutboundError) {
      return NextResponse.json(
        { error: `출고요청서 상신 상태 저장 오류: ${updateOutboundError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      approval_doc_id: approvalDoc.id,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: '출고요청서 상신 처리 중 서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}