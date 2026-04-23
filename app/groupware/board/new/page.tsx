'use client'

import BoardPostEditor from '@/components/groupware/BoardPostEditor'
import {
  BOARD_CATEGORY_OPTIONS,
  BOARD_CATEGORY_VALUE_GENERAL,
  boardBodyHasImages,
} from '@/lib/groupware-board'
import { isSystemAdminUser, type CurrentUserPermissions } from '@/lib/permissions'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

export default function NewBoardPostPage() {
  const router = useRouter()
  const [category, setCategory] = useState(BOARD_CATEGORY_VALUE_GENERAL)
  const [title, setTitle] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [isNotice, setIsNotice] = useState(false)
  const [canWriteNotice, setCanWriteNotice] = useState(false)
  const [ready, setReady] = useState(false)
  const [hasUser, setHasUser] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setHasUser(false)
        setReady(true)
        return
      }
      setHasUser(true)
      const { data: profile } = await supabase
        .from('app_users')
        .select('role_name, can_manage_permissions, can_admin_manage')
        .eq('id', user.id)
        .single()
      setCanWriteNotice(
        isSystemAdminUser(profile as Pick<CurrentUserPermissions, 'role_name' | 'can_manage_permissions' | 'can_admin_manage'>)
      )
      setReady(true)
    })()
  }, [])

  const handleSubmit = useCallback(async () => {
    if (saving) return
    const trimmed = title.trim()
    if (!trimmed) {
      toast.error('제목을 입력하세요')
      return
    }
    setSaving(true)
    setErrorMessage('')
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setErrorMessage('로그인이 필요합니다.')
        return
      }
      const { data, error } = await supabase
        .from('board_posts')
        .insert({
          category,
          title: trimmed,
          body_html: bodyHtml,
          author_id: user.id,
          has_images: boardBodyHasImages(bodyHtml),
          has_attachments: false,
          is_notice: canWriteNotice && isNotice,
        })
        .select('id')
        .single()
      if (error) throw error
      if (!data?.id) throw new Error('저장에 실패했습니다.')
      toast.success('등록되었습니다.')
      router.push(`/groupware/board/${data.id}`)
      router.refresh()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '저장에 실패했습니다.'
      setErrorMessage(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }, [bodyHtml, canWriteNotice, category, isNotice, saving, title, router])

  if (!ready) {
    return <div className="mx-auto max-w-4xl p-4 text-sm text-gray-600">불러오는 중…</div>
  }

  if (!hasUser) {
    return (
      <div className="mx-auto max-w-4xl space-y-3 p-4">
        <h1 className="text-lg font-black text-gray-900">새 글</h1>
        <p className="text-sm text-gray-600">글을 작성하려면 로그인하세요.</p>
        <Link
          href="/login"
          className="inline-flex rounded bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700"
        >
          로그인
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-3 sm:p-4">
      <div className="flex flex-col gap-2 border-b border-gray-200 pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-black text-gray-900 sm:text-xl">새 글</h1>
          <p className="text-xs text-gray-500 sm:text-sm">제목·본문을 입력한 뒤 등록합니다.</p>
        </div>
        <Link
          href="/groupware/board"
          className="text-sm font-bold text-gray-600 hover:text-gray-900 hover:underline"
        >
          ← 목록
        </Link>
      </div>

      {errorMessage ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{errorMessage}</div>
      ) : null}

      <BoardPostEditor
        categories={BOARD_CATEGORY_OPTIONS}
        category={category}
        onCategoryChange={setCategory}
        title={title}
        onTitleChange={setTitle}
        bodyHtml={bodyHtml}
        onBodyHtmlChange={setBodyHtml}
        disabled={saving}
        canWriteNotice={canWriteNotice}
        isNotice={isNotice}
        onIsNoticeChange={setIsNotice}
        footer={
          <>
            <Link
              href="/groupware/board"
              className="inline-flex items-center justify-center rounded border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              취소
            </Link>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saving}
              className="inline-flex items-center justify-center rounded bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? '등록 중…' : '글 작성 완료'}
            </button>
          </>
        }
      />
    </div>
  )
}
