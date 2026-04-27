import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { userIds } = await request.json();

    if (!userIds || !Array.isArray(userIds)) {
      return NextResponse.json({ error: "삭제할 유저 ID가 없습니다." }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let deleteCount = 0;
    const failed: Array<{ id: string; reason: string }> = [];

    for (const id of userIds) {
      // 1. ERP 목록(app_users)에서 정보 삭제
      const { data: deletedRows, error: appDeleteError } = await supabaseAdmin
        .from('app_users')
        .delete()
        .eq('id', id)
        .select('id');

      if (appDeleteError) {
        if (appDeleteError.code === '23503') {
          failed.push({
            id,
            reason:
              '연관 데이터(게시글/결재/메시지/요청 이력 등)가 남아 있어 삭제할 수 없습니다. 관련 이력을 정리하거나 퇴사 처리로 유지해 주세요.',
          });
        } else {
          failed.push({ id, reason: appDeleteError.message });
        }
        continue;
      }

      if (!deletedRows || deletedRows.length === 0) {
        failed.push({ id, reason: '삭제 대상 사용자를 찾지 못했습니다.' });
        continue;
      }

      // 2. Auth(보안 시스템)에서 로그인 계정 완전히 삭제 (뿌리 뽑기)
      const { error } = await supabaseAdmin.auth.admin.deleteUser(id);

      if (error) {
        failed.push({ id, reason: `Auth 계정 삭제 실패: ${error.message}` });
        continue;
      }

      deleteCount++;
    }

    if (failed.length > 0) {
      return NextResponse.json(
        { success: false, count: deleteCount, failed },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, count: deleteCount });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}