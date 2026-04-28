'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Image, Trash2 } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { isErpRoleAdminUser, type CurrentUserPermissions } from '@/lib/permissions'
import {
  BOARD_LIST_TABS,
  boardAnonymousDisplayName,
  getBoardCategoryLabel,
  isAnonymousBoardCategory,
  resolveBoardAuthorMeta,
  type BoardAuthorMeta,
  type BoardCategoryValue,
} from '@/lib/groupware-board'

type BoardPostListRow = {
  id: string
  category: string
  title: string
  created_at: string
  view_count: number
  like_count: number
  comment_count: number
  is_notice: boolean
  has_images: boolean
  author_id: string
}

type BoardSequenceRow = {
  id: string
  created_at: string
}

type AppUserProfileRow = {
  id: string
  user_name: string | null
  user_kind: 'student' | 'teacher' | 'staff' | null
  department: string | null
  can_manage_permissions: boolean | null
}

function formatListDate(iso: string): string {
  try {
    const d = new Date(iso)
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d)
  } catch {
    return iso
  }
}

export default function GroupwareBoardListPage() {
  const [tab, setTab] = useState<string>('')
  const [rows, setRows] = useState<BoardPostListRow[]>([])
  const [postSequenceById, setPostSequenceById] = useState<Record<string, number>>({})
  const [authorMetaById, setAuthorMetaById] = useState<Record<string, BoardAuthorMeta>>({})
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  /** 게시판 글 삭제 열: role `admin`만 */
  const [isRoleAdmin, setIsRoleAdmin] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      setHasSession(Boolean(session))
      if (!session) {
        setRows([])
        setPostSequenceById({})
        setAuthorMetaById({})
        setIsRoleAdmin(false)
        setLoading(false)
        return
      }

      const { data: profile } = await supabase
        .from('app_users')
        .select('role_name, can_manage_permissions, can_admin_manage')
        .eq('id', session.user.id)
        .single()
      setIsRoleAdmin(
        isErpRoleAdminUser(
          profile as Pick<CurrentUserPermissions, 'role_name' | 'can_manage_permissions' | 'can_admin_manage'> | null
        )
      )

      const { data: sequenceRows, error: sequenceError } = await supabase
        .from('board_posts')
        .select('id, created_at')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })

      if (sequenceError) throw sequenceError

      const sequenceMap: Record<string, number> = {}
      ;((sequenceRows ?? []) as BoardSequenceRow[]).forEach((item, index) => {
        sequenceMap[item.id] = index + 1
      })
      setPostSequenceById(sequenceMap)

      let q = supabase
        .from('board_posts')
        .select(
          'id, category, title, created_at, view_count, like_count, comment_count, is_notice, has_images, author_id'
        )
        .order('is_notice', { ascending: false })
        .order('created_at', { ascending: false })

      if (tab) {
        q = q.eq('category', tab as BoardCategoryValue)
      }

      const { data: posts, error: postsError } = await q

      if (postsError) throw postsError

      const list = (posts ?? []) as unknown as BoardPostListRow[]
      setRows(list)

      const ids = [...new Set(list.map((p) => p.author_id).filter(Boolean))]
      if (ids.length === 0) {
        setAuthorMetaById({})
        return
      }

      const { data: users, error: usersError } = await supabase
        .from('app_users')
        .select('id, user_name, user_kind, department, can_manage_permissions')
        .in('id', ids)

      if (usersError) throw usersError

      const map: Record<string, BoardAuthorMeta> = {}
      for (const u of (users ?? []) as AppUserProfileRow[]) {
        map[u.id] = resolveBoardAuthorMeta(u)
      }
      setAuthorMetaById(map)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '목록을 불러오지 못했습니다.'
      setErrorMessage(msg)
      setRows([])
      setPostSequenceById({})
      setAuthorMetaById({})
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    void load()
  }, [load])

  const filteredNotice = useMemo(() => rows.filter((r) => r.is_notice), [rows])
  const filteredNormal = useMemo(() => rows.filter((r) => !r.is_notice), [rows])
  const displayRows = useMemo(() => [...filteredNotice, ...filteredNormal], [filteredNotice, filteredNormal])

  const tableColSpan = 7 + (isRoleAdmin ? 1 : 0)

  const deletePostFromList = useCallback(
    async (postId: string, title: string) => {
      if (!isRoleAdmin) return
      if (
        !confirm(
          `관리자(role: admin) 권한으로 이 글을 삭제할까요?\n\n「${title.slice(0, 80)}${title.length > 80 ? '…' : ''}」\n(댓글·추천 등 연관 데이터도 함께 삭제될 수 있습니다.)`
        )
      ) {
        return
      }
      const { error } = await supabase.from('board_posts').delete().eq('id', postId)
      if (error) {
        setErrorMessage(error.message)
        return
      }
      void load()
    },
    [isRoleAdmin, load]
  )

  return (
    <div className="mx-auto flex w-full max-w-[1800px] min-w-0 flex-col gap-4 bg-background p-4 md:p-6">
      <PageHeader
        title="게시판"
        description="사내 공지·소식을 확인합니다."
        actions={
          <div className="flex flex-wrap gap-2">
          {hasSession ? (
            <Button asChild size="sm">
              <Link href="/groupware/board/new">글쓰기</Link>
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link href="/login">로그인</Link>
            </Button>
          )}
          </div>
        }
      />

      <div className="flex min-w-0 flex-wrap gap-2">
        {BOARD_LIST_TABS.map((t) => {
          const active = tab === t.value
          return (
            <Button
              key={t.value === '' ? 'all' : t.value}
              type="button"
              onClick={() => setTab(t.value)}
              size="sm"
              variant={active ? 'default' : 'outline'}
              className="h-8"
            >
              {t.label}
            </Button>
          )
        })}
      </div>

      {errorMessage ? <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage}</div> : null}

      {!loading && hasSession === false ? (
        <p className="text-sm text-muted-foreground">목록을 보려면 로그인하세요.</p>
      ) : null}

      <Card className="min-w-0 border-border shadow-sm">
        <CardContent className="min-w-0 p-0">
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-xs text-card-foreground sm:text-sm">
          <thead className="sticky top-0 z-[1] bg-muted/50">
            <tr className="border-b border-border text-muted-foreground">
              <th scope="col" className="whitespace-nowrap px-2 py-2 text-right font-bold sm:px-3">
                번호
              </th>
              <th scope="col" className="whitespace-nowrap px-2 py-2 font-bold sm:px-3">
                분류
              </th>
              <th scope="col" className="w-full min-w-[360px] px-2 py-2 font-bold sm:px-3">
                제목
              </th>
              <th scope="col" className="whitespace-nowrap px-2 py-2 font-bold sm:px-3">
                글쓴이
              </th>
              <th
                scope="col"
                className="whitespace-nowrap px-2 py-2 text-right font-bold sm:px-3"
                aria-sort="descending"
                title="작성일 기준 내림차순(최신순) 정렬"
              >
                날짜 <span className="font-normal text-muted-foreground">▼</span>
              </th>
              <th scope="col" className="whitespace-nowrap px-2 py-2 text-right font-bold sm:px-3">
                조회
              </th>
              <th scope="col" className="whitespace-nowrap px-2 py-2 text-right font-bold sm:px-3">
                좋아요
              </th>
              {isRoleAdmin ? (
                <th scope="col" className="whitespace-nowrap px-2 py-2 text-center font-bold sm:px-3">
                  삭제
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-card-foreground">
            {loading ? (
              <tr>
                <td colSpan={tableColSpan} className="px-3 py-8 text-center text-muted-foreground">
                  불러오는 중…
                </td>
              </tr>
            ) : displayRows.length === 0 ? (
              <tr>
                <td colSpan={tableColSpan} className="px-3 py-8 text-center text-muted-foreground">
                  게시글이 없습니다.
                </td>
              </tr>
            ) : (
              displayRows.map((row) => {
                const notice = row.is_notice
                const catLabel = getBoardCategoryLabel(row.category)
                const postNo = postSequenceById[row.id]
                const authorMeta = authorMetaById[row.author_id] ?? { name: '—', icon: '👤' }
                const author = isAnonymousBoardCategory(row.category)
                  ? boardAnonymousDisplayName(row.author_id, row.id)
                  : `${authorMeta.icon} ${authorMeta.name}`
                return (
                  <tr key={row.id} className="hover:bg-muted/40">
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-muted-foreground sm:px-3">
                      {postNo ?? '-'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 sm:px-3">
                      <span className={notice ? 'font-semibold text-red-600' : 'font-medium text-foreground'}>
                        {notice ? '공지' : catLabel}
                      </span>
                    </td>
                    <td className="max-w-[1px] px-2 py-2 sm:px-3">
                      <Link
                        href={`/groupware/board/${row.id}`}
                        className={`group inline-flex min-w-0 max-w-full items-center gap-1.5 font-medium hover:underline ${
                          notice ? 'text-red-700' : 'text-foreground'
                        }`}
                      >
                        <span className="truncate">{row.title}</span>
                        {row.comment_count > 0 ? (
                          <span className="flex-shrink-0 font-bold text-primary">({row.comment_count})</span>
                        ) : null}
                        {row.has_images ? (
                          <Image
                            className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground sm:h-4 sm:w-4"
                            aria-label="이미지 포함"
                          />
                        ) : null}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-muted-foreground sm:px-3">{author}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right text-muted-foreground sm:px-3">
                      {formatListDate(row.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-muted-foreground sm:px-3">
                      {row.view_count}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-muted-foreground sm:px-3">
                      {row.like_count}
                    </td>
                    {isRoleAdmin ? (
                      <td className="whitespace-nowrap px-1 py-2 text-center sm:px-2">
                        <Button
                          type="button"
                          title="글 삭제 (관리자 role: admin)"
                          aria-label="글 삭제"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            void deletePostFromList(row.id, row.title)
                          }}
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      </CardContent>
      </Card>
    </div>
  )
}
