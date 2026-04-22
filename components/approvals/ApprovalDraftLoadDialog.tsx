'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { listWebGeneralDrafts, WEB_GENERAL_DRAFT_REMARKS } from '@/lib/approval-draft'
import { getDocTypeLabel } from '@/lib/approval-status'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type DraftRow = { id: number; title: string | null; drafted_at: string | null; doc_type: string | null }

type ListServerDraftsFn = (
  client: typeof supabase,
  writerId: string,
  remarksTag: string
) => Promise<DraftRow[]>

type ApprovalDraftLoadDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  writerId: string | null
  /** 서버 임시 목록 필터 (신규 페이지·모달 구분) */
  remarksTag?: string
  /** 기본: 일반 기안 임시 목록. 출고요청 등 다른 문서는 전용 목록 함수를 넘깁니다. */
  listServerDrafts?: ListServerDraftsFn
  onLoadServerDraft: (draftId: number) => Promise<boolean>
  onReloadLocal: () => boolean
}

export default function ApprovalDraftLoadDialog({
  open,
  onOpenChange,
  writerId,
  remarksTag = WEB_GENERAL_DRAFT_REMARKS,
  listServerDrafts,
  onLoadServerDraft,
  onReloadLocal,
}: ApprovalDraftLoadDialogProps) {
  const [rows, setRows] = useState<DraftRow[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)

  const loadList = useCallback(async () => {
    if (!writerId) {
      setRows([])
      return
    }
    setLoading(true)
    try {
      const fetcher = listServerDrafts ?? ((c, w, t) => listWebGeneralDrafts(c as any, w, t))
      const data = await fetcher(supabase, writerId, remarksTag)
      setRows((data as DraftRow[]) ?? [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [listServerDrafts, remarksTag, writerId])

  useEffect(() => {
    if (open) void loadList()
  }, [open, loadList])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle className="text-lg font-black">임시저장 불러오기</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="mb-2 font-black text-gray-800">이 브라우저에만 있는 임시본</p>
            <p className="mb-2 text-xs font-bold text-gray-500">
              자동 저장된 내용을 다시 적용합니다. (현재 입력 중인 내용은 덮어씁니다)
            </p>
            <button
              type="button"
              className="rounded-lg border-2 border-black bg-white px-3 py-2 text-xs font-black text-gray-900 hover:bg-gray-100"
              onClick={() => {
                const ok = onReloadLocal()
                if (ok) {
                  toast.success('브라우저 임시본을 불러왔습니다.')
                  onOpenChange(false)
                } else {
                  toast.message('불러올 브라우저 임시본이 없습니다.')
                }
              }}
            >
              브라우저 임시본 다시 불러오기
            </button>
          </div>

          <div>
            <p className="mb-2 font-black text-gray-800">서버에 저장된 임시 문서</p>
            {loading ? (
              <p className="text-xs font-bold text-gray-500">목록 불러오는 중…</p>
            ) : rows.length === 0 ? (
              <p className="text-xs font-bold text-gray-500">서버 임시저장 문서가 없습니다.</p>
            ) : (
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-2 rounded border border-gray-200 bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-bold text-gray-900">{r.title || '(제목 없음)'}</p>
                      <p className="text-[10px] font-bold text-gray-500">
                        {getDocTypeLabel(r.doc_type)} ·{' '}
                        {r.drafted_at ? new Date(r.drafted_at).toLocaleString('ko-KR') : '-'}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busyId != null}
                      className="shrink-0 rounded border border-blue-600 bg-blue-600 px-2 py-1 text-[11px] font-black text-white disabled:opacity-50"
                      onClick={async () => {
                        setBusyId(r.id)
                        const ok = await onLoadServerDraft(r.id)
                        setBusyId(null)
                        if (ok) {
                          toast.success('서버 임시 문서를 불러왔습니다.')
                          onOpenChange(false)
                        }
                      }}
                    >
                      {busyId === r.id ? '…' : '불러오기'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
