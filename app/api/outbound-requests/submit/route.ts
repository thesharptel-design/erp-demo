import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    // 1. 환경 변수 체크 (서버 내부에서 안전하게 체크)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: "Supabase 서버 환경변수(SERVICE_ROLE_KEY)가 없습니다." }, { status: 500 });
    }

    // 2. 관리자 권한 클라이언트 생성 (RLS 무시하고 강제 저장)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body = await request.json();
    const { request_id, requester_id, title, remarks } = body;

    if (!request_id || !requester_id) {
      return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 });
    }

    // 3. 문서 번호 생성 (실무형 간단 시퀀스)
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const docNo = `OUT-${dateStr}-${randomNum}`;

    // 4. 작성자의 부서 ID 가져오기
    const { data: userData, error: userError } = await supabaseAdmin
      .from('app_users')
      .select('dept_id')
      .eq('id', requester_id)
      .single();

    if (userError) throw new Error(`사용자 정보 조회 실패: ${userError.message}`);

    // 5. approval_docs에 결재 문서 생성
    const { data: approvalDoc, error: approvalError } = await supabaseAdmin
      .from('approval_docs')
      .insert({
        doc_no: docNo,
        doc_type: 'OUTBOUND',
        title: title || '출고요청서 결재 상신',
        writer_id: requester_id,
        dept_id: userData?.dept_id || null,
        status: 'submitted', 
        submitted_at: new Date().toISOString(),
        remarks: remarks || ''
      })
      .select('id')
      .single();

    if (approvalError) throw new Error(`결재 문서 생성 실패: ${approvalError.message}`);

    // 6. outbound_requests 테이블 상태 업데이트 (draft -> submitted)
    const { error: updateError } = await supabaseAdmin
      .from('outbound_requests')
      .update({
        approval_doc_id: approvalDoc.id,
        status: 'submitted'
      })
      .eq('id', request_id);

    if (updateError) throw new Error(`출고요청서 상태 업데이트 실패: ${updateError.message}`);

    // 7. 성공 응답
    return NextResponse.json({ 
      message: '결재 상신 완료', 
      approval_doc_id: approvalDoc.id 
    }, { status: 200 });

  } catch (error: any) {
    console.error('결재 상신 백엔드 에러:', error);
    // 에러 발생 시 무한 로딩에 빠지지 않고 프론트엔드로 에러 메시지 전달
    return NextResponse.json({ error: error.message || '서버 내부 오류가 발생했습니다.' }, { status: 500 });
  }
}