// app/api/admin/create-user/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { email, password, user_name, role_name } = await request.json();
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Auth 계정 생성
  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { user_name }
  });

  // 이미 있다면 에러를 뱉지 않고 기존 ID를 가져오도록 처리 (혹시 모를 상황 대비)
  if (authError) {
     return NextResponse.json({ error: "이미 등록된 이메일입니다. Auth에서 삭제 후 다시 시도하세요." }, { status: 400 });
  }

  // 2. app_users 테이블에 데이터 강제 삽입 (upsert 사용)
  const { error: dbError } = await supabaseAdmin
    .from('app_users')
    .upsert([{ 
      id: authUser.user.id, 
      email, 
      user_name, 
      role_name: role_name || '일반', 
      is_active: true 
    }], { onConflict: 'email' });

  if (dbError) return NextResponse.json({ error: "DB 저장 실패: " + dbError.message }, { status: 400 });

  return NextResponse.json({ success: true });
}