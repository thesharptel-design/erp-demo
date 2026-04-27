import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

type RefCount = { label: string; count: number };

async function countBlockingRefs(supabaseAdmin: any, userId: string): Promise<RefCount[]> {
  const checks = await Promise.all([
    supabaseAdmin.from('private_messages').select('id', { count: 'exact', head: true }).eq('sender_id', userId),
    supabaseAdmin.from('notification_events').select('id', { count: 'exact', head: true }).eq('actor_id', userId),
    supabaseAdmin.from('board_posts').select('id', { count: 'exact', head: true }).eq('author_id', userId),
    supabaseAdmin.from('board_comments').select('id', { count: 'exact', head: true }).eq('author_id', userId),
    supabaseAdmin.from('dashboard_schedules').select('id', { count: 'exact', head: true }).eq('created_by', userId),
  ]);

  const labels = ['쪽지 발신', '알림 이벤트 생성', '게시글 작성', '댓글 작성', '일정 생성'];
  return checks.map((res, i) => ({ label: labels[i], count: Number(res.count ?? 0) })).filter((x) => x.count > 0);
}

async function purgePendingUserReferences(supabaseAdmin: any, userId: string) {
  // pending 사용자는 운영 이력이 남지 않게 참조 데이터부터 정리 후 계정 삭제를 시도한다.
  await supabaseAdmin.from('dashboard_schedules').delete().eq('created_by', userId);
  await supabaseAdmin.from('board_comments').delete().eq('author_id', userId);
  await supabaseAdmin.from('board_posts').delete().eq('author_id', userId);
  await supabaseAdmin.from('notification_events').delete().eq('actor_id', userId);
  await supabaseAdmin.from('private_messages').delete().eq('sender_id', userId);
}

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
      const { data: appUser, error: appUserError } = await supabaseAdmin
        .from('app_users')
        .select('id, role_name, employee_no')
        .eq('id', id)
        .maybeSingle();

      if (appUserError) {
        failed.push({ id, reason: `사용자 조회 실패: ${appUserError.message}` });
        continue;
      }
      if (!appUser) {
        failed.push({ id, reason: '삭제 대상 사용자를 찾지 못했습니다.' });
        continue;
      }

      const roleName = String(appUser.role_name ?? '').trim().toLowerCase();
      const isPending = roleName === 'pending';

      if (isPending) {
        await purgePendingUserReferences(supabaseAdmin, id);
      }

      // 1. ERP 목록(app_users)에서 정보 삭제
      const { data: deletedRows, error: appDeleteError } = await supabaseAdmin
        .from('app_users')
        .delete()
        .eq('id', id)
        .select('id');

      if (appDeleteError) {
        if (appDeleteError.code === '23503') {
          const refs = await countBlockingRefs(supabaseAdmin, id);
          const refSummary =
            refs.length > 0
              ? `남은 참조: ${refs.map((r) => `${r.label} ${r.count}건`).join(', ')}`
              : '연결 테이블 참조가 남아 있습니다.';
          failed.push({
            id,
            reason: isPending
              ? `가입승인 대기 사용자 정리 삭제를 시도했지만 참조가 남아 실패했습니다. ${refSummary}`
              : `연관 데이터가 남아 있어 삭제할 수 없습니다. ${refSummary}`,
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