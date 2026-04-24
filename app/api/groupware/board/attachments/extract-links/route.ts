import { createClient } from '@supabase/supabase-js'
import { PDFArray, PDFDict, PDFHexString, PDFName, PDFString, type PDFRef, PDFDocument } from 'pdf-lib'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const FETCH_TITLE_TIMEOUT_MS = 5000

type AdminProfile = {
  role_name: string | null
  can_manage_permissions?: boolean | null
  can_admin_manage?: boolean | null
}

function isSystemAdminProfile(profile: AdminProfile | null): boolean {
  if (!profile) return false
  if (String(profile.role_name ?? '').toLowerCase() === 'admin') return true
  return Boolean(profile.can_manage_permissions) || Boolean(profile.can_admin_manage)
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function normalizePdfMime(file: File): boolean {
  const byMime = file.type === 'application/pdf'
  const byName = file.name.toLowerCase().endsWith('.pdf')
  return byMime || byName
}

function decodeHtmlEntities(input: string): string {
  return input
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ')
}

function stripTags(input: string): string {
  return input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function firstMatch(content: string, pattern: RegExp): string | null {
  const match = content.match(pattern)
  if (!match?.[1]) return null
  return match[1].trim()
}

function fallbackTitleFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.hostname
  } catch {
    return '링크'
  }
}

async function fetchTitleFromUrl(url: string): Promise<string> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TITLE_TIMEOUT_MS)
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; ERP-Board-LinkExtractor/1.0)',
      },
    })
    clearTimeout(timer)
    if (!response.ok) return fallbackTitleFromUrl(url)

    const html = await response.text()
    const ogTitle =
      firstMatch(html, /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i) ??
      firstMatch(html, /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["'][^>]*>/i)
    const titleTag = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i)
    const raw = ogTitle ?? titleTag
    if (!raw) return fallbackTitleFromUrl(url)
    const normalized = stripTags(decodeHtmlEntities(raw))
    return normalized || fallbackTitleFromUrl(url)
  } catch {
    return fallbackTitleFromUrl(url)
  }
}

async function extractHttpLinksFromPdf(file: File): Promise<string[]> {
  const payload = await file.arrayBuffer()
  const pdfDoc = await PDFDocument.load(payload)
  const links = new Set<string>()

  for (const page of pdfDoc.getPages()) {
    const annots = page.node.get(PDFName.of('Annots'))
    if (!(annots instanceof PDFArray)) continue

    for (let i = 0; i < annots.size(); i++) {
      const annotRef = annots.get(i)
      const annot = pdfDoc.context.lookup(annotRef as PDFRef)
      if (!(annot instanceof PDFDict)) continue

      const subtype = annot.get(PDFName.of('Subtype'))
      if (!(subtype instanceof PDFName) || subtype !== PDFName.of('Link')) continue

      const action = annot.lookup(PDFName.of('A'))
      if (!(action instanceof PDFDict)) continue

      const uri = action.lookup(PDFName.of('URI'))
      const url =
        uri instanceof PDFString
          ? uri.decodeText()
          : uri instanceof PDFHexString
            ? uri.decodeText()
            : null

      if (isHttpUrl(url)) links.add(url)
    }
  }

  return [...links]
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
    if (profileError || !isSystemAdminProfile((profile ?? null) as AdminProfile | null)) {
      return NextResponse.json({ error: 'PDF 링크 추출은 시스템 관리자만 사용할 수 있습니다.' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '업로드할 PDF 파일이 필요합니다.' }, { status: 400 })
    }
    if (!normalizePdfMime(file)) {
      return NextResponse.json({ error: 'PDF 파일만 업로드할 수 있습니다.' }, { status: 400 })
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'PDF 파일은 10MB를 초과할 수 없습니다.' }, { status: 400 })
    }

    const links = await extractHttpLinksFromPdf(file)
    const linkItems = await Promise.all(
      links.map(async (url) => ({
        url,
        title: await fetchTitleFromUrl(url),
      }))
    )
    return NextResponse.json({
      success: true,
      fileName: file.name,
      links,
      linkItems,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '서버 오류가 발생했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
