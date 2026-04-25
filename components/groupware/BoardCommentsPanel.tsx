'use client'

import {
  CornerDownRight,
  MessageSquare,
  Pencil,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react'
import { boardAnonymousDisplayName, resolveBoardAuthorMeta, type BoardAuthorMeta } from '@/lib/groupware-board'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type BoardCommentRow = {
  id: number
  post_id: string
  author_id: string
  body: string
  created_at: string
  parent_id: number | null
  like_count: number
  is_deleted: boolean
  modified_after_reply: boolean
}

type AppUserProfileRow = {
  id: string
  user_name: string | null
  user_kind: 'student' | 'teacher' | 'staff' | null
  department: string | null
  can_manage_permissions: boolean | null
}

type OrderedComment = BoardCommentRow & { depth: number }

function formatCommentTime(iso: string): string {
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

function commentHasReplies(commentId: number, list: BoardCommentRow[]): boolean {
  return list.some((r) => r.parent_id === commentId)
}

function orderCommentsForDisplay(rows: BoardCommentRow[]): OrderedComment[] {
  const children = new Map<number | 'root', BoardCommentRow[]>()
  for (const r of rows) {
    const key = r.parent_id == null ? 'root' : r.parent_id
    const list = children.get(key)
    if (list) list.push(r)
    else children.set(key, [r])
  }
  for (const [, list] of children) {
    list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }
  const out: OrderedComment[] = []
  const walk = (parentKey: number | 'root', depth: number) => {
    for (const c of children.get(parentKey) ?? []) {
      out.push({ ...c, depth })
      walk(c.id, depth + 1)
    }
  }
  walk('root', 0)
  return out
}

function mapCommentRow(c: Record<string, unknown>): BoardCommentRow {
  return {
    id: c.id as number,
    post_id: c.post_id as string,
    author_id: c.author_id as string,
    body: (c.body as string) ?? '',
    created_at: c.created_at as string,
    parent_id: (c.parent_id as number | null) ?? null,
    like_count: typeof c.like_count === 'number' ? c.like_count : 0,
    is_deleted: Boolean(c.is_deleted),
    modified_after_reply: Boolean(c.modified_after_reply),
  }
}

type Props = {
  postId: string
  currentUserId: string | null
  /** role `admin`만: 타인 댓글 삭제 버튼 */
  isBoardDeleteAdmin?: boolean
  /** true면 작성자명을 DB가 아닌 익명_난수로 표시 */
  anonymousBoard?: boolean
  onMetaChange?: () => void
}

export default function BoardCommentsPanel({
  postId,
  currentUserId,
  isBoardDeleteAdmin = false,
  anonymousBoard = false,
  onMetaChange,
}: Props) {
  const [rows, setRows] = useState<BoardCommentRow[]>([])
  const [authorMetaById, setAuthorMetaById] = useState<Record<string, BoardAuthorMeta>>({})
  const [myCommentLikes, setMyCommentLikes] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [topBody, setTopBody] = useState('')
  const [submittingTop, setSubmittingTop] = useState(false)
  const [replyingTo, setReplyingTo] = useState<number | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [submittingReply, setSubmittingReply] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editBody, setEditBody] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const ordered = useMemo(() => orderCommentsForDisplay(rows), [rows])
  const visibleCommentCount = useMemo(() => rows.filter((r) => !r.is_deleted).length, [rows])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: comments, error } = await supabase
        .from('board_comments')
        .select(
          'id, post_id, author_id, body, created_at, parent_id, like_count, is_deleted, modified_after_reply'
        )
        .eq('post_id', postId)
        .order('created_at', { ascending: true })

      if (error) throw error
      const rawList = (comments ?? []) as Record<string, unknown>[]
      const list = rawList.map(mapCommentRow)
      setRows(list)

      const ids = [...new Set(list.map((c) => c.author_id))]
      if (ids.length === 0) {
        setAuthorMetaById({})
      } else if (anonymousBoard) {
        const map: Record<string, BoardAuthorMeta> = {}
        for (const aid of ids) {
          map[aid] = { name: boardAnonymousDisplayName(aid, postId), icon: '' }
        }
        setAuthorMetaById(map)
      } else {
        const { data: users } = await supabase
          .from('app_users')
          .select('id, user_name, user_kind, department, can_manage_permissions')
          .in('id', ids)
        const map: Record<string, BoardAuthorMeta> = {}
        for (const u of (users ?? []) as AppUserProfileRow[]) {
          map[u.id] = resolveBoardAuthorMeta(u)
        }
        setAuthorMetaById(map)
      }

      if (currentUserId && list.length > 0) {
        const cids = list.map((c) => c.id)
        const { data: likes } = await supabase
          .from('board_comment_likes')
          .select('comment_id')
          .eq('user_id', currentUserId)
          .in('comment_id', cids)
        setMyCommentLikes(new Set((likes ?? []).map((l) => (l as { comment_id: number }).comment_id)))
      } else {
        setMyCommentLikes(new Set())
      }
    } finally {
      setLoading(false)
    }
  }, [postId, currentUserId, anonymousBoard])

  useEffect(() => {
    void load()
  }, [load])

  const submitTop = async () => {
    const body = topBody.trim()
    if (!body || !currentUserId || submittingTop) return
    setSubmittingTop(true)
    try {
      const { error } = await supabase.from('board_comments').insert({
        post_id: postId,
        author_id: currentUserId,
        body,
        parent_id: null,
      })
      if (error) throw error
      setTopBody('')
      await load()
      onMetaChange?.()
    } finally {
      setSubmittingTop(false)
    }
  }

  const submitReply = async (parentId: number) => {
    const body = replyBody.trim()
    if (!body || !currentUserId || submittingReply) return
    const parent = rows.find((r) => r.id === parentId)
    if (!parent || parent.is_deleted) return
    setSubmittingReply(true)
    try {
      const { error } = await supabase.from('board_comments').insert({
        post_id: postId,
        author_id: currentUserId,
        body,
        parent_id: parentId,
      })
      if (error) throw error
      setReplyBody('')
      setReplyingTo(null)
      await load()
      onMetaChange?.()
    } finally {
      setSubmittingReply(false)
    }
  }

  const toggleCommentLike = async (commentId: number) => {
    if (!currentUserId) return
    const row = rows.find((r) => r.id === commentId)
    if (!row || row.is_deleted) return
    const liked = myCommentLikes.has(commentId)
    try {
      if (liked) {
        const { error } = await supabase
          .from('board_comment_likes')
          .delete()
          .eq('comment_id', commentId)
          .eq('user_id', currentUserId)
        if (error) throw error
        setMyCommentLikes((prev) => {
          const n = new Set(prev)
          n.delete(commentId)
          return n
        })
      } else {
        const { error } = await supabase.from('board_comment_likes').insert({
          comment_id: commentId,
          user_id: currentUserId,
        })
        if (error) throw error
        setMyCommentLikes((prev) => new Set(prev).add(commentId))
      }
      await load()
    } catch {
      // ignore
    }
  }

  const saveEdit = async (id: number) => {
    const body = editBody.trim()
    if (!body || savingEdit) return
    const hasReplies = commentHasReplies(id, rows)
    setSavingEdit(true)
    try {
      const { error } = await supabase
        .from('board_comments')
        .update(
          hasReplies
            ? { body, modified_after_reply: true }
            : { body, modified_after_reply: false, is_deleted: false }
        )
        .eq('id', id)
      if (error) throw error
      setEditingId(null)
      await load()
    } finally {
      setSavingEdit(false)
    }
  }

  const removeComment = async (id: number) => {
    if (!isBoardDeleteAdmin) return
    if (!confirm('관리자 권한으로 이 댓글을 삭제할까요?')) return
    const hasReplies = commentHasReplies(id, rows)
    if (hasReplies) {
      const { error } = await supabase
        .from('board_comments')
        .update({
          is_deleted: true,
          body: '',
          modified_after_reply: false,
        })
        .eq('id', id)
      if (error) return
    } else {
      const { error } = await supabase.from('board_comments').delete().eq('id', id)
      if (error) return
    }
    if (replyingTo === id) {
      setReplyingTo(null)
      setReplyBody('')
    }
    setEditingId(null)
    await load()
    onMetaChange?.()
  }

  return (
    <section className="border-t border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-3 py-2 sm:px-4">
        <h2 className="text-sm font-black text-gray-800">댓글 {visibleCommentCount}개</h2>
      </div>

      {loading ? (
        <p className="px-4 py-6 text-sm text-gray-500">댓글 불러오는 중…</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {ordered.map((c) => {
            const isMine = currentUserId != null && c.author_id === currentUserId
            const liked = myCommentLikes.has(c.id)
            const pad = Math.min(c.depth, 6) * 12

            if (c.is_deleted) {
              return (
                <li key={c.id} className="px-2 py-3 sm:px-3" style={{ paddingLeft: 12 + pad }}>
                  {c.depth > 0 ? (
                    <div className="mb-1 flex items-center gap-1 text-xs text-gray-400">
                      <CornerDownRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    </div>
                  ) : null}
                  <p className="text-sm text-gray-400">[삭제된 댓글입니다]</p>
                </li>
              )
            }

            return (
              <li key={c.id} className="px-2 py-3 sm:px-3" style={{ paddingLeft: 12 + pad }}>
                {c.depth > 0 ? (
                  <div className="mb-1 flex items-center gap-1 text-xs text-gray-400">
                    <CornerDownRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  </div>
                ) : null}

                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-600">
                      {(authorMetaById[c.author_id]?.name || '?').replace(/^익명_/, '').slice(0, 1) || '?'}
                    </div>
                    <div className="min-w-0">
                      <span
                        className={
                          anonymousBoard
                            ? 'text-sm font-bold text-slate-700'
                            : 'text-sm font-bold text-gray-900'
                        }
                      >
                        {anonymousBoard
                          ? (authorMetaById[c.author_id]?.name || '—')
                          : `${authorMetaById[c.author_id]?.icon ?? '👤'} ${authorMetaById[c.author_id]?.name || '—'}`}
                      </span>
                      <span className="ml-2 text-xs text-gray-400">{formatCommentTime(c.created_at)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <button
                      type="button"
                      onClick={() => void toggleCommentLike(c.id)}
                      disabled={!currentUserId}
                      className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 font-bold transition-colors disabled:opacity-40 ${
                        liked ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
                      {c.like_count}
                    </button>
                    {currentUserId ? (
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingTo((prev) => (prev === c.id ? null : c.id))
                          setReplyBody('')
                        }}
                        className="inline-flex items-center gap-0.5 font-bold text-gray-600 hover:text-gray-900"
                      >
                        <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                        댓글
                      </button>
                    ) : null}
                    {isMine ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(c.id)
                          setEditBody(c.body)
                          setReplyingTo(null)
                        }}
                        className="inline-flex items-center gap-0.5 font-bold text-gray-600 hover:text-blue-700"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        수정
                      </button>
                    ) : null}
                    {isBoardDeleteAdmin ? (
                      <button
                        type="button"
                        onClick={() => void removeComment(c.id)}
                        className="inline-flex items-center gap-0.5 font-bold text-gray-600 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        삭제
                      </button>
                    ) : null}
                  </div>
                </div>

                {editingId === c.id ? (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={3}
                      className="w-full resize-y rounded border border-gray-300 p-2 text-sm outline-none focus:border-blue-500"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={savingEdit}
                        onClick={() => void saveEdit(c.id)}
                        className="rounded bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        저장
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-sm leading-relaxed text-gray-900">
                    {c.modified_after_reply ? (
                      <>
                        <p className="mb-1 text-xs font-bold text-gray-500">[수정된 댓글입니다]</p>
                        <p className="whitespace-pre-wrap">{c.body}</p>
                      </>
                    ) : (
                      <p className="whitespace-pre-wrap">{c.body}</p>
                    )}
                  </div>
                )}

                {replyingTo === c.id && currentUserId ? (
                  <div className="mt-3 rounded border border-gray-200 bg-gray-50/80 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-1 text-xs font-bold text-gray-700">
                        <CornerDownRight className="h-4 w-4 text-gray-400" aria-hidden />
                        <span>댓글 쓰기</span>
                        <span className="font-normal text-gray-400">(대댓글)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingTo(null)
                          setReplyBody('')
                        }}
                        className="inline-flex items-center gap-0.5 text-xs font-bold text-gray-500 hover:text-gray-800"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                        닫기
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <textarea
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        rows={4}
                        placeholder="내용을 입력하세요"
                        className="min-h-[88px] flex-1 resize-y rounded border border-gray-300 bg-white p-2 text-sm outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        disabled={submittingReply}
                        onClick={() => void submitReply(c.id)}
                        className="self-stretch rounded border border-gray-300 bg-gray-100 px-3 text-sm font-black text-gray-800 hover:bg-gray-200 disabled:opacity-50"
                      >
                        등록
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {currentUserId ? (
        <div className="border-t border-gray-200 p-3 sm:p-4">
          <div className="mb-2 text-xs font-black uppercase tracking-wide text-gray-500">댓글 쓰기</div>
          <div className="flex gap-2">
            <textarea
              value={topBody}
              onChange={(e) => setTopBody(e.target.value)}
              rows={4}
              placeholder="댓글을 입력하세요."
              className="min-h-[100px] flex-1 resize-y rounded border border-gray-300 p-3 text-sm outline-none focus:border-blue-500"
            />
            <button
              type="button"
              disabled={submittingTop}
              onClick={() => void submitTop()}
              className="self-stretch rounded border border-gray-300 bg-gray-100 px-4 text-sm font-black text-gray-800 hover:bg-gray-200 disabled:opacity-50"
            >
              등록
            </button>
          </div>
        </div>
      ) : (
        <p className="border-t border-gray-200 p-4 text-xs text-gray-500">댓글을 작성하려면 로그인하세요.</p>
      )}
    </section>
  )
}
