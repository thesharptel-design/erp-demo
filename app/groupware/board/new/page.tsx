'use client'

import BoardPostEditor from '@/components/groupware/BoardPostEditor'
import {
  BOARD_CATEGORY_OPTIONS,
  BOARD_CATEGORY_VALUE_GENERAL,
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

export default function NewBoardPostPage() {
  const router = useRouter()
  const { isSubmitting: isMutating, run: runSingleSubmit } = useSingleSubmit()
  const [category, setCategory] = useState(BOARD_CATEGORY_VALUE_GENERAL)
  const [title, setTitle] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [isNotice, setIsNotice] = useState(false)
  const [canWriteNotice, setCanWriteNotice] = useState(false)
  const [canUsePdfTools, setCanUsePdfTools] = useState(false)
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
        isErpRoleAdminUser(
          profile as Pick<CurrentUserPermissions, 'role_name' | 'can_manage_permissions' | 'can_admin_manage'> | null
        )
      )
      setCanUsePdfTools(
        isSystemAdminUser(
          profile as Pick<CurrentUserPermissions, 'role_name' | 'can_manage_permissions' | 'can_admin_manage'> | null
        )
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
    })
  }, [bodyHtml, canWriteNotice, category, isNotice, saving, title, router, runSingleSubmit])

  if (!ready) {
    return <div className="mx-auto w-full max-w-[1800px] p-4 text-sm text-muted-foreground md:p-6">불러오는 중…</div>
  }

  if (!hasUser) {
    return (
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-3 p-4 md:p-6">
        <PageHeader title="새 글" description="글을 작성하려면 로그인하세요." />
        <Button asChild size="sm" className="w-fit">
          <Link href="/login">로그인</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1800px] min-w-0 flex-col gap-4 bg-background p-4 md:p-6">
      <PageHeader
        title="새 글"
        description="제목·본문을 입력한 뒤 등록합니다."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/groupware/board">← 목록</Link>
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
        // useSingleSubmit also blocks rapid duplicate clicks.
        canWriteNotice={canWriteNotice}
        canExtractPdfLinks={canUsePdfTools}
        isNotice={isNotice}
        onIsNoticeChange={setIsNotice}
        footer={
          <>
            <Button asChild variant="outline">
              <Link href="/groupware/board">취소</Link>
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saving || isMutating}
            >
              {saving ? '등록 중…' : '글 작성 완료'}
            </Button>
          </>
        }
      />
      </CardContent>
      </Card>
    </div>
  )
}
