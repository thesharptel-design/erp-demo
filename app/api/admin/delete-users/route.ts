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

    for (const id of userIds) {
      // 1. ERP 목록(app_users)에서 정보 삭제
      await supabaseAdmin.from('app_users').delete().eq('id', id);

      // 2. Auth(보안 시스템)에서 로그인 계정 완전히 삭제 (뿌리 뽑기)
      const { error } = await supabaseAdmin.auth.admin.deleteUser(id);

      if (!error) deleteCount++;
    }

    return NextResponse.json({ success: true, count: deleteCount });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}