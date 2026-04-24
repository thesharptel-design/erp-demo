'use client'

import BoardPostEditor from '@/components/groupware/BoardPostEditor'
import {
  BOARD_CATEGORY_OPTIONS,
  boardBodyHasImages,
} from '@/lib/groupware-board'
import { isErpRoleAdminUser, isSystemAdminUser, type CurrentUserPermissions } from '@/lib/permissions'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

type PostRow = {
  id: string
  category: string
  title: string
  body_html: string
  author_id: string
  is_notice: boolean
}

export default function EditBoardPostPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [postId, setPostId] = useState<string | null>(null)
  const [category, setCategory] = useState('')
  const [title, setTitle] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [isNotice, setIsNotice] = useState(false)
  const [canWriteNotice, setCanWriteNotice] = useState(false)
  const [canUsePdfTools, setCanUsePdfTools] = useState(false)
  const [ready, setReady] = useState(false)
  const [allowed, setAllowed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { id } = await params
      if (cancelled) return
      setPostId(id)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setAllowed(false)
        setReady(true)
        return
      }

      const { data: profile } = await supabase
        .from('app_users')
        .select('role_name, can_manage_permissions, can_admin_manage')
        .eq('id', user.id)
        .single()
      setCanWriteNotice(isErpRoleAdminUser(profile as Pick<CurrentUserPermissions, 'role_name'> | null))
      setCanUsePdfTools(
        isSystemAdminUser(
          profile as Pick<CurrentUserPermissions, 'role_name' | 'can_manage_permissions' | 'can_admin_manage'> | null
        )
      )

      const { data: row, error } = await supabase
        .from('board_posts')
        .select('id, category, title, body_html, author_id, is_notice')
        .eq('id', id)
        .single()

      if (cancelled) return
      if (error || !row) {
        setAllowed(false)
        setReady(true)
        return
      }

      const post = row as PostRow
      if (post.author_id !== user.id) {
        setAllowed(false)
        setReady(true)
        return
      }

      setCategory(post.category)
      setTitle(post.title)
      setBodyHtml(post.body_html)
      setIsNotice(post.is_notice)
      setAllowed(true)
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [params])

  const handleSubmit = useCallback(async () => {
    if (!postId || saving) return
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
      const { error } = await supabase
        .from('board_posts')
        .update({
          category,
          title: trimmed,
          body_html: bodyHtml,
          has_images: boardBodyHasImages(bodyHtml),
          is_notice: canWriteNotice && isNotice,
        })
        .eq('id', postId)
        .eq('author_id', user.id)
      if (error) throw error
      toast.success('수정되었습니다.')
      router.push(`/groupware/board/${postId}`)
      router.refresh()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '저장에 실패했습니다.'
      setErrorMessage(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }, [bodyHtml, canWriteNotice, category, isNotice, postId, saving, title, router])

  if (!ready) {
    return <div className="mx-auto max-w-4xl p-4 text-sm text-gray-600">불러오는 중…</div>
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-4xl space-y-3 p-4">
        <h1 className="text-lg font-black text-gray-900">글 수정</h1>
        <p className="text-sm text-gray-600">이 글을 수정할 권한이 없거나 존재하지 않습니다.</p>
        <Link href="/groupware/board" className="text-sm font-bold text-blue-600 hover:underline">
          목록으로
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-3 sm:p-4">
      <div className="flex flex-col gap-2 border-b border-gray-200 pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-black text-gray-900 sm:text-xl">글 수정</h1>
          <p className="text-xs text-gray-500 sm:text-sm">내용을 수정한 뒤 저장합니다.</p>
        </div>
        <Link
          href={postId ? `/groupware/board/${postId}` : '/groupware/board'}
          className="text-sm font-bold text-gray-600 hover:text-gray-900 hover:underline"
        >
          ← 보기
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
        canExtractPdfLinks={canUsePdfTools}
        isNotice={isNotice}
        onIsNoticeChange={setIsNotice}
        footer={
          <>
            <Link
              href={postId ? `/groupware/board/${postId}` : '/groupware/board'}
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
              {saving ? '저장 중…' : '저장'}
            </button>
          </>
        }
      />
    </div>
  )
}
