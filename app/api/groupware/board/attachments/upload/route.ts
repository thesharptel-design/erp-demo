import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

const BOARD_ATTACHMENT_BUCKET = 'board_attachments'
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const PDF_MIME_TYPES = new Set(['application/pdf'])

type AppUserProfile = {
  role_name: string | null
  can_manage_permissions?: boolean | null
  can_admin_manage?: boolean | null
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function getFileExtension(file: File): string {
  const sanitized = sanitizeFileName(file.name)
  const ext = sanitized.split('.').pop()
  if (ext && ext.length <= 10) return ext.toLowerCase()
  return 'png'
}

function isPdfFile(file: File): boolean {
  const byMime = PDF_MIME_TYPES.has(file.type)
  const byName = file.name.toLowerCase().endsWith('.pdf')
  return byMime || byName
}

function isSystemAdminProfile(profile: AppUserProfile | null): boolean {
  if (!profile) return false
  if (String(profile.role_name ?? '').toLowerCase() === 'admin') return true
  return Boolean(profile.can_manage_permissions) || Boolean(profile.can_admin_manage)
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: '서버 환경변수가 누락되었습니다.' }, { status: 500 })
    }

    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '인증 정보가 없습니다.' }, { status: 401 })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const jwt = authHeader.replace('Bearer ', '')
    const {
      data: { user },
      error: authError,
    } = await adminClient.auth.getUser(jwt)
    if (authError || !user?.id) {
      return NextResponse.json({ error: '현재 사용자 인증을 확인할 수 없습니다.' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await adminClient
      .from('app_users')
      .select('role_name, can_manage_permissions, can_admin_manage')
      .eq('id', user.id)
      .single()
    if (profileError || !profile) {
      return NextResponse.json({ error: '현재 사용자 권한을 확인할 수 없습니다.' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '업로드할 파일이 필요합니다.' }, { status: 400 })
    }
    const pdfFile = isPdfFile(file)
    if (!pdfFile && !file.type.startsWith('image/')) {
      return NextResponse.json({ error: '이미지 또는 PDF 파일만 업로드할 수 있습니다.' }, { status: 400 })
    }
    if (pdfFile && !isSystemAdminProfile(profile as AppUserProfile)) {
      return NextResponse.json({ error: 'PDF 업로드는 시스템 관리자만 사용할 수 있습니다.' }, { status: 403 })
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: '파일은 10MB를 초과할 수 없습니다.' }, { status: 400 })
    }

    const ext = getFileExtension(file)
    const objectPath = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`
    const payload = await file.arrayBuffer()
    const { error: uploadError } = await adminClient.storage
      .from(BOARD_ATTACHMENT_BUCKET)
      .upload(objectPath, payload, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json({ error: `파일 업로드 실패: ${uploadError.message}` }, { status: 400 })
    }

    const { data: publicUrlData } = adminClient.storage.from(BOARD_ATTACHMENT_BUCKET).getPublicUrl(objectPath)

    return NextResponse.json({
      success: true,
      publicUrl: publicUrlData.publicUrl,
      path: objectPath,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '서버 오류가 발생했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
