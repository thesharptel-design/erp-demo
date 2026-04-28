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
import { useSingleSubmit } from '@/hooks/useSingleSubmit'
import PageHeader from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

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
  const { isSubmitting: isMutating, run: runSingleSubmit } = useSingleSubmit()
  const [postId, setPostId] = useState<string | null>(null)
  const [category, setCategory] = useState('')
  const [title, setTitle] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [isNotice, setIsNotice] = useState(false)
  const [canWriteNotice, setCanWriteNotice] = useState(false)
  const [canUsePdfTools, setCanUsePdfTools] = useState(false)
  /** 시스템 관리자이면서 작성자가 아닐 때: 분류(탭)만 저장 */
  const [tabMoveOnly, setTabMoveOnly] = useState(false)
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
      const sysAdmin = isSystemAdminUser(
        profile as Pick<CurrentUserPermissions, 'role_name' | 'can_manage_permissions' | 'can_admin_manage'> | null
      )
      setCanWriteNotice(
        isErpRoleAdminUser(
          profile as Pick<CurrentUserPermissions, 'role_name' | 'can_manage_permissions' | 'can_admin_manage'> | null
        )
      )
      setCanUsePdfTools(sysAdmin)

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
      const isAuthor = post.author_id === user.id
      const moveTabOnly = sysAdmin && !isAuthor
      if (!isAuthor && !sysAdmin) {
        setAllowed(false)
        setTabMoveOnly(false)
        setReady(true)
        return
      }

      setTabMoveOnly(moveTabOnly)
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
    if (!BOARD_CATEGORY_OPTIONS.some((o) => o.value === category)) {
      toast.error('분류가 올바르지 않습니다.')
      return
    }
    const trimmed = title.trim()
    if (!tabMoveOnly && !trimmed) {
      toast.error('제목을 입력하세요')
      return
    }
    await runSingleSubmit(async () => {
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
      if (tabMoveOnly) {
        const { error } = await supabase.from('board_posts').update({ category }).eq('id', postId)
        if (error) throw error
        toast.success('게시판 분류(탭)이 변경되었습니다.')
      } else {
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
      }
      router.push(`/groupware/board/${postId}`)
      router.refresh()
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '저장에 실패했습니다.'
        setErrorMessage(msg)
        toast.error(msg)
      } finally {
        setSaving(false)
      }
    })
  }, [bodyHtml, canWriteNotice, category, isNotice, postId, saving, tabMoveOnly, title, router, runSingleSubmit])

  if (!ready) {
    return <div className="mx-auto w-full max-w-[1800px] p-4 text-sm text-muted-foreground md:p-6">불러오는 중…</div>
  }

  if (!allowed) {
    return (
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-3 p-4 md:p-6">
        <PageHeader title="글 수정" description="이 글을 수정할 권한이 없거나 존재하지 않습니다." />
        <Button asChild variant="outline" size="sm" className="w-fit">
          <Link href="/groupware/board">목록으로</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1800px] min-w-0 flex-col gap-4 bg-background p-4 md:p-6">
      <PageHeader
        title={tabMoveOnly ? '분류(탭) 변경' : '글 수정'}
        description={tabMoveOnly ? '목록에 표시되는 게시판 탭(분류)만 바꿉니다.' : '내용을 수정한 뒤 저장합니다.'}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={postId ? `/groupware/board/${postId}` : '/groupware/board'}>← 보기</Link>
          </Button>
        }
      />

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{errorMessage}</div>
      ) : null}

      <Card className="border-border shadow-sm">
        <CardContent className="p-4 sm:p-6">
      <BoardPostEditor
        categories={BOARD_CATEGORY_OPTIONS}
        category={category}
        onCategoryChange={setCategory}
        title={title}
        onTitleChange={setTitle}
        bodyHtml={bodyHtml}
        onBodyHtmlChange={setBodyHtml}
        disabled={saving}
        categoryMoveOnly={tabMoveOnly}
        canWriteNotice={!tabMoveOnly && canWriteNotice}
        canExtractPdfLinks={!tabMoveOnly && canUsePdfTools}
        isNotice={isNotice}
        onIsNoticeChange={setIsNotice}
        footer={
          <>
            <Button asChild variant="outline">
              <Link href={postId ? `/groupware/board/${postId}` : '/groupware/board'}>취소</Link>
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saving || isMutating}
            >
              {saving ? '저장 중…' : '저장'}
            </Button>
          </>
        }
      />
      </CardContent>
      </Card>
    </div>
  )
}
