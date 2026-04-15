import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { approvalDocId, lineId, action, comment, actorId } = await request.json();

    // 1. 현재 결재선 정보 조회
    const { data: currentLine } = await supabaseAdmin
      .from('approval_lines')
      .select('*')
      .eq('id', lineId)
      .single();

    if (!currentLine || currentLine.status !== 'pending') {
      return NextResponse.json({ error: '결재 가능한 상태가 아닙니다.' }, { status: 400 });
    }

    // 2. 승인 처리 시
    if (action === 'approve') {
      // (1) 현재 단계 승인 처리
      await supabaseAdmin
        .from('approval_lines')
        .update({ status: 'approved', acted_at: new Date().toISOString(), opinion: comment })
        .eq('id', lineId);

      // (2) 다음 결재자 찾기
      const { data: nextLine } = await supabaseAdmin
        .from('approval_lines')
        .outline
        .select('*')
        .eq('approval_doc_id', approvalDocId)
        .eq('line_no', currentLine.line_no + 1)
        .single();

      if (nextLine) {
        // 다음 결재자가 있으면 해당 단계를 pending으로
        await supabaseAdmin
          .from('approval_lines')
          .update({ status: 'pending' })
          .eq('id', nextLine.id);
          
        await supabaseAdmin
          .from('approval_docs')
          .update({ current_line_no: nextLine.line_no, status: 'in_review' })
          .eq('id', approvalDocId);
      } else {
        // 더 이상 결재자가 없으면 최종 승인 완료
        await supabaseAdmin
          .from('approval_docs')
          .update({ status: 'approved', completed_at: new Date().toISOString() })
          .eq('id', approvalDocId);
          
        // 트리거가 있다면 여기서 출고요청서 본문 상태도 같이 바뀜
      }
    } 
    // 3. 반려 처리 시
    else if (action === 'reject') {
      await supabaseAdmin
        .from('approval_lines')
        .update({ status: 'rejected', acted_at: new Date().toISOString(), opinion: comment })
        .eq('id', lineId);

      await supabaseAdmin
        .from('approval_docs')
        .update({ status: 'rejected' })
        .eq('id', approvalDocId);
    }

    // 4. 이력 기록
    await supabaseAdmin.from('approval_histories').insert({
      approval_doc_id: approvalDocId,
      approval_line_id: lineId,
      actor_id: actorId,
      action_type: action,
      action_comment: comment
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}