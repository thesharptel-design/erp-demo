'use client'

import BoardCommentsPanel from '@/components/groupware/BoardCommentsPanel'
import BoardPostBodyWithLightbox from '@/components/groupware/BoardPostBodyWithLightbox'
import {
  boardAnonymousDisplayName,
  getBoardCategoryLabel,
  isAnonymousBoardCategory,
  resolveBoardAuthorMeta,
} from '@/lib/groupware-board'
import { isErpRoleAdminUser, isSystemAdminUser, type CurrentUserPermissions } from '@/lib/permissions'
import { ThumbsUp } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const VIEW_SESSION_KEY = 'gw_board_viewed:'

type BoardPostDetail = {
  id: string
  category: string
  title: string
  body_html: string
  author_id: string
  created_at: string
  updated_at: string
  view_count: number
  comment_count: number
  like_count: number
  is_notice: boolean
  has_images: boolean
  has_attachments: boolean
}

type AuthorRow = {
  id: string
  user_name: string | null
  user_kind: 'student' | 'teacher' | 'staff' | null
  department: string | null
  can_manage_permissions: boolean | null
}

type PostLikerRow = {
  user_id: string
  created_at: string
  display_name: string
}

function formatDetailDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export default function GroupwareBoardPostPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [post, setPost] = useState<BoardPostDetail | null>(null)
  const [authorName, setAuthorName] = useState('—')
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  /** 글/댓글 삭제: role `admin`만 */
  const [isRoleAdmin, setIsRoleAdmin] = useState(false)
  /** 타인 글 분류(탭) 변경: 시스템 관리자 */
  const [canMoveBoardTab, setCanMoveBoardTab] = useState(false)
  const [likedPost, setLikedPost] = useState(false)
  const [postLikers, setPostLikers] = useState<PostLikerRow[]>([])
  const [postLikersLoading, setPostLikersLoading] = useState(false)

  const resolveId = useCallback(async () => {
    const resolved = await params
    return resolved.id
  }, [params])

  const refreshPostMeta = useCallback(async (id: string) => {
    const { data: meta } = await supabase
      .from('board_posts')
      .select('comment_count, like_count')
      .eq('id', id)
      .maybeSingle()
    if (meta) {
      const row = meta as Pick<BoardPostDetail, 'comment_count' | 'like_count'>
      setPost((p) =>
        p ? { ...p, comment_count: row.comment_count, like_count: row.like_count ?? p.like_count } : p
      )
    }
  }, [])

  const loadPostLikeState = useCallback(async (postId: string, uid: string | null) => {
    if (!uid) {
      setLikedPost(false)
      return
    }
    const { data } = await supabase
      .from('board_post_likes')
      .select('post_id')
      .eq('post_id', postId)
      .eq('user_id', uid)
      .maybeSingle()
    setLikedPost(Boolean(data))
  }, [])

  const loadPostLikers = useCallback(async (postId: string) => {
    setPostLikersLoading(true)
    try {
      const { data: likes, error } = await supabase
        .from('board_post_likes')
        .select('user_id, created_at')
        .eq('post_id', postId)
        .order('created_at', { ascending: true })
      if (error || !likes?.length) {
        setPostLikers([])
        return
      }
      const userIds = [...new Set(likes.map((r) => r.user_id).filter(Boolean))] as string[]
      const { data: users } = await supabase
        .from('app_users')
        .select('id, user_name, user_kind, department, can_manage_permissions')
        .in('id', userIds)
      const nameById = new Map<string, string>()
      for (const u of (users ?? []) as AuthorRow[]) {
        nameById.set(u.id, resolveBoardAuthorMeta(u).name)
      }
      setPostLikers(
        likes.map((row) => ({
          user_id: row.user_id,
          created_at: row.created_at,
          display_name: nameById.get(row.user_id) ?? '알 수 없음',
        }))
      )
    } finally {
      setPostLikersLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setLoading(true)
      setErrorMessage('')
      setPost(null)
      setAuthorName('—')
      setIsRoleAdmin(false)
      setCanMoveBoardTab(false)

      const id = await resolveId()
      if (cancelled) return

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session) {
          setErrorMessage('이 글을 보려면 로그인하세요.')
          setLoading(false)
          return
        }
        setCurrentUserId(session.user.id)

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
        setCanMoveBoardTab(
          isSystemAdminUser(
            profile as Pick<CurrentUserPermissions, 'role_name' | 'can_manage_permissions' | 'can_admin_manage'> | null
          )
        )

        const { data: row, error: fetchError } = await supabase
          .from('board_posts')
          .select(
            'id, category, title, body_html, author_id, created_at, updated_at, view_count, comment_count, like_count, is_notice, has_images, has_attachments'
          )
          .eq('id', id)
          .single()

        if (cancelled) return
        if (fetchError || !row) {
          setErrorMessage('게시글을 찾을 수 없습니다.')
          setLoading(false)
          return
        }

        const typed = row as unknown as BoardPostDetail
        setPost(typed)
        void loadPostLikeState(id, session.user.id)

        if (isAnonymousBoardCategory(typed.category)) {
          setAuthorName(boardAnonymousDisplayName(typed.author_id, typed.id))
        } else {
          const { data: author } = await supabase
            .from('app_users')
            .select('id, user_name, user_kind, department, can_manage_permissions')
            .eq('id', typed.author_id)
            .maybeSingle()
          if (cancelled) return
          if (author) {
            const meta = resolveBoardAuthorMeta(author as AuthorRow)
            setAuthorName(`${meta.icon} ${meta.name}`)
          } else {
            setAuthorName('—')
          }
        }

        if (typeof window !== 'undefined') {
          const key = VIEW_SESSION_KEY + id
          if (!window.sessionStorage.getItem(key)) {
            const { data: newCount, error: rpcError } = await supabase.rpc('increment_board_post_views', {
              p_post_id: id,
            })
            if (!rpcError && typeof newCount === 'number') {
              window.sessionStorage.setItem(key, '1')
              setPost((p) => (p ? { ...p, view_count: newCount } : p))
            }
          }
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setErrorMessage(e instanceof Error ? e.message : '불러오는 중 오류가 발생했습니다.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [resolveId, loadPostLikeState])

  useEffect(() => {
    if (!post?.id || !currentUserId) {
      setPostLikers([])
      return
    }
    if (post.author_id !== currentUserId && !canMoveBoardTab) {
      setPostLikers([])
      return
    }
    void loadPostLikers(post.id)
  }, [post?.id, post?.author_id, currentUserId, canMoveBoardTab, loadPostLikers])

  const togglePostLike = async () => {
    if (!post || !currentUserId) return
    try {
      if (likedPost) {
        const { error } = await supabase
          .from('board_post_likes')
          .delete()
          .eq('post_id', post.id)
          .eq('user_id', currentUserId)
        if (error) throw error
        setLikedPost(false)
      } else {
        const { error } = await supabase.from('board_post_likes').insert({
          post_id: post.id,
          user_id: currentUserId,
        })
        if (error) throw error
        setLikedPost(true)
      }
      await refreshPostMeta(post.id)
      if (post.author_id === currentUserId || canMoveBoardTab) {
        void loadPostLikers(post.id)
      }
    } catch {
      // ignore
    }
  }

  const deletePost = async () => {
    if (!post || !currentUserId) return
    if (!isAuthor && !isRoleAdmin) return
    if (!confirm('이 글을 삭제할까요? (댓글·추천 등 연관 데이터도 함께 삭제될 수 있습니다.)')) return
    let q = supabase.from('board_posts').delete().eq('id', post.id)
    if (isAuthor && !isRoleAdmin) {
      q = q.eq('author_id', currentUserId)
    }
    const { error } = await q
    if (error) return
    router.replace('/groupware/board')
    router.refresh()
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-4 text-sm text-gray-600">
        <p>불러오는 중…</p>
      </div>
    )
  }

  if (errorMessage || !post) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <p className="text-sm text-red-800">{errorMessage || '게시글을 찾을 수 없습니다.'}</p>
        <Link href="/groupware/board" className="text-sm font-bold text-blue-600 hover:underline">
          목록으로
        </Link>
      </div>
    )
  }

  const notice = post.is_notice
  const categoryLabel = notice ? '공지' : getBoardCategoryLabel(post.category)
  const bracketLabel = notice ? '공지' : `[${categoryLabel}]`
  const isAuthor = currentUserId != null && currentUserId === post.author_id

  return (
    <div className="mx-auto max-w-3xl bg-white text-gray-900 shadow-sm sm:rounded-lg sm:border sm:border-gray-200">
      <article className="border-b border-gray-200 px-3 py-4 sm:px-6 sm:py-5">
        <nav className="mb-4 flex flex-wrap items-center gap-1 text-xs font-bold text-gray-500 sm:text-sm">
          <Link href="/groupware/board" className="text-gray-700 hover:text-blue-600 hover:underline">
            게시판
          </Link>
          <span className="text-gray-300">|</span>
          <span className={notice ? 'text-red-600' : 'text-gray-800'}>{bracketLabel}</span>
        </nav>

        <div className="flex flex-col gap-2 border-b border-gray-100 pb-3 sm:flex-row sm:items-start sm:justify-between">
          <h1
            className={`text-xl font-black leading-snug sm:text-2xl ${
              notice ? 'text-red-800' : 'text-gray-900'
            }`}
          >
            {post.title}
          </h1>
          <time
            className="shrink-0 text-right text-xs text-gray-400 sm:text-sm"
            dateTime={post.created_at}
          >
            {formatDetailDate(post.created_at)}
          </time>
        </div>

        <div className="mt-3 flex flex-col gap-2 border-b border-gray-100 pb-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div
            className={
              isAnonymousBoardCategory(post.category)
                ? 'font-bold text-slate-700'
                : 'font-bold text-gray-800'
            }
          >
            {authorName}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 sm:text-sm">
            <span>조회수 {post.view_count}</span>
            <span>추천수 {post.like_count}</span>
            <span>댓글 {post.comment_count}</span>
          </div>
        </div>

        <BoardPostBodyWithLightbox
          html={post.body_html || '<p class="text-gray-500">내용이 없습니다.</p>'}
          className="board-post-html mt-5 max-w-full min-h-[160px] overflow-x-auto text-sm leading-[1.6] text-gray-900 sm:text-base [&_p]:leading-[1.6] [&_li]:leading-[1.6] [&_h1]:leading-[1.6] [&_h2]:leading-[1.6] [&_a]:text-blue-600 [&_a]:underline [&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-bold [&_img]:max-h-96 [&_img]:w-auto [&_img]:max-w-full [&_img]:rounded [&_img]:border [&_img]:border-gray-200 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:m-0 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-300 [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-100 [&_th]:px-2 [&_th]:py-1.5 [&_ul]:list-disc [&_ul]:pl-6"
        />

        <div className="mt-8 flex flex-col items-center gap-2 border-y border-gray-100 py-6">
          <button
            type="button"
            onClick={() => void togglePostLike()}
            disabled={!currentUserId}
            className={`inline-flex items-center gap-2 rounded-lg border-2 px-6 py-2.5 text-sm font-black transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              likedPost
                ? 'border-blue-600 bg-blue-50 text-blue-800'
                : 'border-blue-400 bg-white text-blue-700 hover:bg-blue-50/60'
            }`}
          >
            <ThumbsUp className="h-5 w-5" aria-hidden />
            추천 {post.like_count}
          </button>
          {!currentUserId ? (
            <p className="text-xs text-gray-400">로그인 후 추천할 수 있습니다.</p>
          ) : null}
          {isAuthor || canMoveBoardTab ? (
            postLikersLoading ? (
              <p className="text-xs text-gray-400">추천자 목록 불러오는 중…</p>
            ) : postLikers.length > 0 ? (
              <div className="w-full max-w-md rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-left">
                <p className="text-[10px] font-black uppercase tracking-wide text-gray-500">
                  추천한 사람 <span className="font-bold normal-case text-gray-400">(작성자·시스템 관리자만 표시)</span>
                </p>
                <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto text-xs font-bold text-gray-800">
                  {postLikers.map((liker) => (
                    <li
                      key={`${liker.user_id}-${liker.created_at}`}
                      className="flex justify-between gap-2 border-b border-gray-100 pb-1 last:border-0"
                    >
                      <span className="min-w-0 truncate">{liker.display_name}</span>
                      <time className="shrink-0 text-[10px] font-bold text-gray-400" dateTime={liker.created_at}>
                        {formatDetailDate(liker.created_at)}
                      </time>
                    </li>
                  ))}
                </ul>
              </div>
            ) : post.like_count === 0 ? (
              <p className="text-xs text-gray-400">아직 추천한 사람이 없습니다.</p>
            ) : null
          ) : null}
        </div>

        {isAuthor || isRoleAdmin || canMoveBoardTab ? (
          <div className="mt-4 flex justify-end gap-3 border-b border-gray-100 pb-4 text-sm">
            {isAuthor ? (
              <Link
                href={`/groupware/board/${post.id}/edit`}
                className="font-bold text-gray-600 hover:text-blue-600 hover:underline"
              >
                수정
              </Link>
            ) : null}
            {canMoveBoardTab && !isAuthor ? (
              <Link
                href={`/groupware/board/${post.id}/edit`}
                className="font-bold text-gray-600 hover:text-blue-600 hover:underline"
              >
                탭 이동
              </Link>
            ) : null}
            {isAuthor || isRoleAdmin ? (
              <button
                type="button"
                onClick={() => void deletePost()}
                className="font-bold text-gray-600 hover:text-red-600"
              >
                삭제
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5">
          <Link
            href="/groupware/board"
            className="flex w-full items-center justify-center rounded border border-gray-300 bg-gray-50 py-3 text-sm font-black text-gray-800 hover:bg-gray-100"
          >
            목록으로
          </Link>
        </div>
      </article>

      <BoardCommentsPanel
        postId={post.id}
        currentUserId={currentUserId}
        isBoardDeleteAdmin={isRoleAdmin}
        anonymousBoard={isAnonymousBoardCategory(post.category)}
        onMetaChange={() => void refreshPostMeta(post.id)}
      />
    </div>
  )
}
