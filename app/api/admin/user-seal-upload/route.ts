import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { hasManagePermission } from '@/lib/permissions';

const USER_SEAL_BUCKET = 'user-seals';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '인증 정보가 없습니다.' }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const jwt = authHeader.replace('Bearer ', '');
    const {
      data: { user: currentUser },
      error: currentUserError,
    } = await supabaseAdmin.auth.getUser(jwt);

    if (currentUserError || !currentUser?.email) {
      return NextResponse.json({ error: '현재 사용자 인증을 확인할 수 없습니다.' }, { status: 401 });
    }

    const { data: currentAppUser, error: currentAppUserError } = await supabaseAdmin
      .from('app_users')
      .select('id, role_name, can_manage_permissions, can_admin_manage')
      .eq('email', currentUser.email)
      .single();

    if (currentAppUserError || !hasManagePermission(currentAppUser, 'can_manage_permissions')) {
      return NextResponse.json({ error: '도장 업로드 권한이 없습니다.' }, { status: 403 });
    }

    const formData = await request.formData();
    const userId = String(formData.get('user_id') ?? '').trim();
    const file = formData.get('file');

    if (!userId) {
      return NextResponse.json({ error: 'user_id가 필요합니다.' }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '업로드 파일이 필요합니다.' }, { status: 400 });
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ error: '이미지 파일만 업로드할 수 있습니다.' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: '파일 크기는 5MB를 초과할 수 없습니다.' }, { status: 400 });
    }

    const ext = sanitizeFileName(file.name).split('.').pop() || 'png';
    const objectPath = `${userId}/${Date.now()}.${ext}`;
    const buffer = await file.arrayBuffer();
    const { error: uploadError } = await supabaseAdmin.storage
      .from(USER_SEAL_BUCKET)
      .upload(objectPath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: `도장 업로드 실패: ${uploadError.message}` }, { status: 400 });
    }

    const { error: updateError } = await supabaseAdmin
      .from('app_users')
      .update({ seal_image_path: objectPath })
      .eq('id', userId);

    if (updateError) {
      return NextResponse.json({ error: `도장 경로 저장 실패: ${updateError.message}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, seal_image_path: objectPath });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '서버 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
