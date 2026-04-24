'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Image, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { isErpRoleAdminUser, type CurrentUserPermissions } from '@/lib/permissions'
import {
  BOARD_LIST_TABS,
  boardAnonymousDisplayName,
  getBoardCategoryLabel,
  isAnonymousBoardCategory,
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

type AppUserProfileRow = {
  id: string
  user_name: string | null
  user_kind: 'student' | 'teacher' | 'staff' | null
  department: string | null
  role_name: string | null
  can_manage_permissions: boolean | null
  can_admin_manage: boolean | null
}

type AuthorProfileMeta = {
  name: string
  icon: string
}

function resolveStaffIconByDepartment(department: string | null | undefined): string {
  const dept = String(department ?? '').trim()
  if (!dept) return '👔'
  if (dept.includes('영업') || dept.includes('구매')) return '💼'
  if (dept.includes('자재')) return '📦'
  if (dept.includes('생산')) return '🏭'
  if (dept.includes('품질') || dept.toUpperCase().includes('QC')) return '🧪'
  return '👔'
}

function resolveAuthorMeta(profile: AppUserProfileRow): AuthorProfileMeta {
  const isSystemAdmin = Boolean(profile.can_manage_permissions)

  if (isSystemAdmin) {
    return { name: profile.user_name?.trim() || '—', icon: '🛡️' }
  }

  if (profile.user_kind === 'student') {
    return { name: profile.user_name?.trim() || '—', icon: '🎓' }
  }

  if (profile.user_kind === 'teacher') {
    return { name: profile.user_name?.trim() || '—', icon: '🧑‍🏫' }
  }

  return { name: profile.user_name?.trim() || '—', icon: resolveStaffIconByDepartment(profile.department) }
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
  const [authorMetaById, setAuthorMetaById] = useState<Record<string, AuthorProfileMeta>>({})
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
        setAuthorMetaById({})
        setIsRoleAdmin(false)
        setLoading(false)
        return
      }

      const { data: profile } = await supabase.from('app_users').select('role_name').eq('id', session.user.id).single()
      setIsRoleAdmin(isErpRoleAdminUser(profile as Pick<CurrentUserPermissions, 'role_name'> | null))

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
        .select('id, user_name, user_kind, department, role_name, can_manage_permissions, can_admin_manage')
        .in('id', ids)

      if (usersError) throw usersError

      const map: Record<string, AuthorProfileMeta> = {}
      for (const u of (users ?? []) as AppUserProfileRow[]) {
        map[u.id] = resolveAuthorMeta(u)
      }
      setAuthorMetaById(map)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '목록을 불러오지 못했습니다.'
      setErrorMessage(msg)
      setRows([])
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

  const tableColSpan = 6 + (isRoleAdmin ? 1 : 0)

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
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-4">
      <div className="flex flex-col gap-3 border-b border-gray-200 pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-black text-gray-900 sm:text-xl">게시판</h1>
          <p className="text-xs text-gray-500 sm:text-sm">사내 공지·소식을 확인합니다.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasSession ? (
            <Link
              href="/groupware/board/new"
              className="inline-flex items-center justify-center rounded bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 sm:text-sm"
            >
              글쓰기
            </Link>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 sm:text-sm"
            >
              로그인
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-2">
        {BOARD_LIST_TABS.map((t) => {
          const active = tab === t.value
          return (
            <button
              key={t.value === '' ? 'all' : t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors sm:text-sm ${
                active
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {errorMessage ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{errorMessage}</div>
      ) : null}

      {!loading && hasSession === false ? (
        <p className="text-sm text-gray-600">목록을 보려면 로그인하세요.</p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-[760px] w-full border-collapse text-left text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-gray-600">
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
                날짜 <span className="font-normal text-gray-400">▼</span>
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
          <tbody className="divide-y divide-gray-200 text-gray-800">
            {loading ? (
              <tr>
                <td colSpan={tableColSpan} className="px-3 py-8 text-center text-gray-500">
                  불러오는 중…
                </td>
              </tr>
            ) : displayRows.length === 0 ? (
              <tr>
                <td colSpan={tableColSpan} className="px-3 py-8 text-center text-gray-500">
                  게시글이 없습니다.
                </td>
              </tr>
            ) : (
              displayRows.map((row) => {
                const notice = row.is_notice
                const catLabel = getBoardCategoryLabel(row.category)
                const authorMeta = authorMetaById[row.author_id] ?? { name: '—', icon: '👤' }
                const author = isAnonymousBoardCategory(row.category)
                  ? boardAnonymousDisplayName(row.author_id, row.id)
                  : `${authorMeta.icon} ${authorMeta.name}`
                return (
                  <tr key={row.id} className="hover:bg-gray-50/80">
                    <td className="whitespace-nowrap px-2 py-2 sm:px-3">
                      <span
                        className={
                          notice
                            ? 'font-bold text-red-600'
                            : 'font-semibold text-gray-700'
                        }
                      >
                        {notice ? '공지' : catLabel}
                      </span>
                    </td>
                    <td className="max-w-[1px] px-2 py-2 sm:px-3">
                      <Link
                        href={`/groupware/board/${row.id}`}
                        className={`group inline-flex min-w-0 max-w-full items-center gap-1.5 font-semibold hover:underline ${
                          notice ? 'text-red-700' : 'text-gray-900'
                        }`}
                      >
                        <span className="truncate">{row.title}</span>
                        {row.comment_count > 0 ? (
                          <span className="flex-shrink-0 font-bold text-blue-600">({row.comment_count})</span>
                        ) : null}
                        {row.has_images ? (
                          <Image
                            className="h-3.5 w-3.5 flex-shrink-0 text-gray-500 sm:h-4 sm:w-4"
                            aria-label="이미지 포함"
                          />
                        ) : null}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-gray-600 sm:px-3">{author}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right text-gray-600 sm:px-3">
                      {formatListDate(row.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-gray-600 sm:px-3">
                      {row.view_count}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-gray-600 sm:px-3">
                      {row.like_count}
                    </td>
                    {isRoleAdmin ? (
                      <td className="whitespace-nowrap px-1 py-2 text-center sm:px-2">
                        <button
                          type="button"
                          title="글 삭제 (관리자 role: admin)"
                          aria-label="글 삭제"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            void deletePostFromList(row.id, row.title)
                          }}
                          className="inline-flex items-center justify-center rounded border border-red-200 bg-red-50 p-1.5 text-red-700 hover:bg-red-100"
                        >
                          <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                        </button>
                      </td>
                    ) : null}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
