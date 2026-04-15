import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Supabase 서버 환경변수가 설정되지 않았습니다.");
}

// RLS를 무시하는 관리자 클라이언트
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { requesterId, customerId, purpose, remarks, items, reviewers, finalApprover } = body;

    // 1. 필수 값 검증
    if (!requesterId || !items || items.length === 0 || !finalApprover) {
      return NextResponse.json({ error: '필수 항목이 누락되었습니다 (요청자, 품목, 최종 결재권자 필수).' }, { status: 400 });
    }

    // 2. 문서 번호 생성 (실무형 간단 시퀀스 - OUTBOUND용)
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const docNo = `OUT-${dateStr}-${randomNum}`;

    // 3. 기안자 정보(부서 ID 등) 가져오기
    const { data: userData, error: userError } = await supabaseAdmin
      .from('app_users')
      .select('dept_id')
      .eq('id', requesterId)
      .single();

    if (userError) throw new Error(`기안자 정보 조회 실패: ${userError.message}`);

    // --- [중앙 결재 엔진 연동 시작] ---
    
    // 4. approval_docs 에 결재 마스터 생성 (상태: submitted)
    const { data: approvalDoc, error: approvalError } = await supabaseAdmin
      .from('approval_docs')
      .insert({
        doc_no: docNo,
        doc_type: 'OUTBOUND', // 💡 이 문서가 출고요청서임을 명시
        title: `[출고요청] ${purpose}`,
        writer_id: requesterId,
        dept_id: userData?.dept_id || null, // dept_id nullable 여부에 따라 처리
        status: 'submitted',
        current_line_no: 1, // 💡 첫 번째 결재자 대기 중
        submitted_at: new Date().toISOString(),
        remarks: remarks || ''
      })
      .select('id')
      .single();

    if (approvalError) throw new Error(`결재 마스터 생성 실패: ${approvalError.message}`);
    const approvalDocId = approvalDoc.id;

    // 5. approval_lines 에 다중 결재선 생성 (대표님이 주신 DDL 구조 반영)
    const approvalLinesData = [];
    let currentLineNo = 1;

    // 5-1. 검토자들 추가 (선택)
    if (reviewers && reviewers.length > 0) {
      for (const reviewerId of reviewers) {
        approvalLinesData.push({
          approval_doc_id: approvalDocId,
          line_no: currentLineNo,
          approver_id: reviewerId,
          approver_role: 'review', // 검토자
          // 첫 번째 결재자만 pending, 나머지는 waiting
          status: currentLineNo === 1 ? 'pending' : 'waiting' 
        });
        currentLineNo++;
      }
    }

    // 5-2. 최종 결재권자 추가 (필수)
    approvalLinesData.push({
      approval_doc_id: approvalDocId,
      line_no: currentLineNo,
      approver_id: finalApprover,
      approver_role: 'approve', // 최종 결재권자
      status: currentLineNo === 1 ? 'pending' : 'waiting'
    });

    const { error: linesError } = await supabaseAdmin
      .from('approval_lines')
      .insert(approvalLinesData);

    if (linesError) throw new Error(`결재선 저장 실패: ${linesError.message}`);

    // 6. approval_histories 에 상신 이력 남기기 (Audit Trail)
    const { error: historyError } = await supabaseAdmin
      .from('approval_histories')
      .insert({
        approval_doc_id: approvalDocId,
        actor_id: requesterId,
        action_type: 'submit',
        action_comment: '기안 상신'
      });
      
    if (historyError) console.warn("이력 저장 실패 (진행은 계속함):", historyError.message);

    // --- [개별 업무(Spoke) 연동 시작] ---

    // 7. outbound_requests (출고요청 마스터) 생성
    // 💡 중앙 결재 문서 ID(approval_doc_id)를 FK로 연결합니다.
    const { data: requestData, error: requestError } = await supabaseAdmin
      .from('outbound_requests')
      .insert({
        req_no: docNo, // 결재 문서 번호와 통일
        req_date: new Date().toISOString().slice(0, 10),
        requester_id: requesterId,
        customer_id: customerId || null,
        purpose,
        remarks,
        status: 'submitted', // 초기 상태 변경
        approval_doc_id: approvalDocId, // 🔥 허브 연동 키!
        outbound_completed: false
      })
      .select('id')
      .single();

    if (requestError) throw new Error(`출고요청서 저장 실패: ${requestError.message}`);
    const outboundRequestId = requestData.id;

    // 8. outbound_request_items (출고요청 상세 품목) 생성
    const itemsToInsert = items.map((item: any, index: number) => ({
      outbound_request_id: outboundRequestId,
      line_no: index + 1,
      item_id: item.item_id || item.itemId,
      qty: item.qty,
      remarks: item.remarks || ''
    }));

    const { error: itemsError } = await supabaseAdmin
      .from('outbound_request_items')
      .insert(itemsToInsert);

    if (itemsError) throw new Error(`출고 품목 저장 실패: ${itemsError.message}`);

    // 9. 성공 응답
    return NextResponse.json({ 
      success: true,
      message: '결재 상신 완료', 
      id: outboundRequestId 
    }, { status: 201 });

  } catch (error: any) {
    console.error('출고요청서 및 결재선 생성 에러:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// GET 목록 조회용 코드는 기존과 동일하게 유지하거나 삭제 (프론트에서 직접 조회하는 경우)
export async function GET() {
   // ... 생략 ...
   return NextResponse.json({ message: "GET Method" });
}