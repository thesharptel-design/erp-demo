import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, email, user_name, phone, department, job_rank, new_password } = body;

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Auth(인증) 정보 업데이트 (이메일이나 비밀번호가 변경되었을 때만 작동)
    const authUpdates: any = {};
    if (email) authUpdates.email = email;
    if (new_password) authUpdates.password = new_password; // 🌟 새로운 비밀번호 덮어쓰기

    if (Object.keys(authUpdates).length > 0) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, authUpdates);
      if (authError) throw authError;
    }

    // 2. app_users 테이블(ERP 정보) 업데이트
    const { error: dbError } = await supabaseAdmin.from('app_users').update({
      email,
      user_name,
      phone,
      department,
      job_rank
    }).eq('id', id);

    if (dbError) throw dbError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}