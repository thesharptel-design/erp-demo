'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, ExternalLink, Eye, FileImage, FileText, Link2, Loader2, Plus, Trash2, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { openApprovalShellPopup } from '@/lib/approval-popup'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type AttachmentRow = {
  id: number
  approval_doc_id: number | null
  attachment_kind: 'file' | 'approval_doc'
  draft_session_key: string | null
  status: string | null
  last_autosave_at: string | null
  expires_at: string | null
  file_name: string | null
  file_url: string | null
  mime_type: string | null
  file_size: number | null
  related_approval_doc_id: number | null
  created_at: string
  created_by: string
}

type RelatedDocRow = {
  id: number
  doc_no: string | null
  title: string | null
  doc_type: string | null
  status: string | null
  writer_id: string
}

const MAX_FILE_BYTES = 30 * 1024 * 1024
const ESC_HINT = 'ESC 키를 누르면 미리보기를 닫을 수 있습니다.'

function toReadableBytes(value: number | null): string {
  if (!value || value <= 0) return '—'
  const kb = value / 1024
  if (kb < 1024) return `${kb.toFixed(1)}KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)}MB`
  return `${(mb / 1024).toFixed(2)}GB`
}

function isImageAttachment(row: AttachmentRow): boolean {
  const mime = (row.mime_type ?? '').toLowerCase()
  const name = (row.file_name ?? row.file_url ?? '').toLowerCase()
  return mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/.test(name)
}

function supportsPreview(row: AttachmentRow): boolean {
  return row.attachment_kind === 'file' && isImageAttachment(row) && Boolean(row.file_url)
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export default function ApprovalDetailAttachmentsPanel({
  docId,
  draftSessionKey,
  writerId,
  currentUserId,
  sourceDocNo,
  sourceTitle,
  editable = false,
}: {
  docId?: number | null
  draftSessionKey?: string | null
  writerId: string
  currentUserId: string | null
  sourceDocNo?: string | null
  sourceTitle?: string | null
  editable?: boolean
}) {
  const canManage = Boolean(editable && currentUserId && currentUserId === writerId)

  const [attachments, setAttachments] = useState<AttachmentRow[]>([])
  const [relatedDocMap, setRelatedDocMap] = useState<Map<number, RelatedDocRow>>(new Map())
  const [eligibleDocs, setEligibleDocs] = useState<RelatedDocRow[]>([])
  const [selectedDocId, setSelectedDocId] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [addingRelated, setAddingRelated] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [openImageUrl, setOpenImageUrl] = useState<string | null>(null)
  const [openImageAlt, setOpenImageAlt] = useState('첨부 이미지')

  const refreshAttachments = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')
    try {
      let q = supabase
        .from('approval_doc_attachments')
        .select(
          'id, approval_doc_id, draft_session_key, status, last_autosave_at, expires_at, attachment_kind, file_name, file_url, mime_type, file_size, related_approval_doc_id, created_at, created_by'
        )
        .order('created_at', { ascending: false })
      if (docId != null) {
        q = q.eq('approval_doc_id', docId)
      } else if (draftSessionKey && currentUserId) {
        q = q.eq('draft_session_key', draftSessionKey).eq('created_by', currentUserId).in('status', ['temp', 'linked'])
      } else {
        setAttachments([])
        setRelatedDocMap(new Map())
        setLoading(false)
        return
      }
      const { data, error } = await q
      if (error) throw error
      const rows = (data ?? []) as AttachmentRow[]
      setAttachments(rows)

      const relatedIds = [...new Set(rows.map((r) => r.related_approval_doc_id).filter((v): v is number => Number.isFinite(v)))]
      if (relatedIds.length === 0) {
        setRelatedDocMap(new Map())
        return
      }
      const { data: relatedRows, error: relErr } = await supabase
        .from('approval_docs')
        .select('id, doc_no, title, doc_type, status, writer_id')
        .in('id', relatedIds)
      if (relErr) throw relErr
      const map = new Map<number, RelatedDocRow>()
      for (const row of (relatedRows ?? []) as RelatedDocRow[]) {
        map.set(row.id, row)
      }
      setRelatedDocMap(map)
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : '첨부문서를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [docId, draftSessionKey, currentUserId])

  const loadEligibleDocs = useCallback(async () => {
    if (!canManage || !currentUserId) {
      setEligibleDocs([])
      return
    }
    const { data, error } = await supabase
      .from('approval_docs')
      .select('id, doc_no, title, doc_type, status, writer_id')
      .eq('writer_id', currentUserId)
      .eq('status', 'approved')
      .neq('id', docId ?? 0)
      .order('drafted_at', { ascending: false })
      .limit(60)
    if (error) return
    setEligibleDocs(((data ?? []) as RelatedDocRow[]).filter((row) => row.status === 'approved'))
  }, [canManage, currentUserId, docId])

  useEffect(() => {
    void refreshAttachments()
    void loadEligibleDocs()
  }, [refreshAttachments, loadEligibleDocs])

  const addUploadedFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!canManage || !currentUserId || !fileList || fileList.length === 0) return
      setUploading(true)
      setErrorMessage('')
      try {
        const fileRows: Record<string, unknown>[] = []
        for (const file of Array.from(fileList)) {
          if (file.size > MAX_FILE_BYTES) {
            throw new Error(`${file.name}: 파일 크기는 30MB를 초과할 수 없습니다.`)
          }
          const safeName = sanitizeFileName(file.name || 'attachment')
          const keyLabel = docId != null ? `doc-${docId}` : `session-${(draftSessionKey ?? 'draft').slice(0, 32)}`
          const path = `${currentUserId}/${keyLabel}/${Date.now()}-${crypto.randomUUID()}-${safeName}`
          const { error: uploadErr } = await supabase.storage
            .from('approval_attachments')
            .upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' })
          if (uploadErr) throw uploadErr
          const { data } = supabase.storage.from('approval_attachments').getPublicUrl(path)
          fileRows.push({
            approval_doc_id: docId ?? null,
            attachment_kind: 'file',
            file_name: file.name,
            file_url: data.publicUrl,
            mime_type: file.type || null,
            file_size: file.size,
            related_approval_doc_id: null,
            created_by: currentUserId,
            // 임시저장 전에는 session으로 귀속
            draft_session_key: draftSessionKey ?? null,
            status: docId != null ? 'linked' : 'temp',
            last_autosave_at: docId != null ? new Date().toISOString() : null,
            expires_at: docId != null ? null : new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
          })
        }
        const { error: insErr } = await supabase.from('approval_doc_attachments').insert(fileRows)
        if (insErr) throw insErr
        await refreshAttachments()
      } catch (e: unknown) {
        setErrorMessage(e instanceof Error ? e.message : '파일 첨부에 실패했습니다.')
      } finally {
        setUploading(false)
      }
    },
    [canManage, currentUserId, docId, draftSessionKey, refreshAttachments]
  )

  const addRelatedDoc = useCallback(async () => {
    if (!canManage || !currentUserId) return
    const relatedId = Number(selectedDocId)
    if (!Number.isFinite(relatedId) || relatedId <= 0) {
      setErrorMessage('첨부할 결재문서를 먼저 선택해 주세요.')
      return
    }
    setAddingRelated(true)
    setErrorMessage('')
    try {
      const { error } = await supabase.from('approval_doc_attachments').insert({
        approval_doc_id: docId ?? null,
        attachment_kind: 'approval_doc',
        related_approval_doc_id: relatedId,
        file_name: null,
        file_url: null,
        mime_type: null,
        file_size: null,
        created_by: currentUserId,
        draft_session_key: draftSessionKey ?? null,
        status: docId != null ? 'linked' : 'temp',
        last_autosave_at: docId != null ? new Date().toISOString() : null,
        expires_at: docId != null ? null : new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      })
      if (error) throw error
      setSelectedDocId('')
      await refreshAttachments()
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : '결재문서 첨부에 실패했습니다.')
    } finally {
      setAddingRelated(false)
    }
  }, [canManage, currentUserId, docId, draftSessionKey, refreshAttachments, selectedDocId])

  const deleteAttachment = useCallback(
    async (row: AttachmentRow) => {
      if (!canManage) return
      if (!confirm('이 첨부 항목을 삭제할까요?')) return
      setErrorMessage('')
      try {
        if (row.attachment_kind === 'file' && row.file_url?.includes('/storage/v1/object/public/approval_attachments/')) {
          const marker = '/storage/v1/object/public/approval_attachments/'
          const idx = row.file_url.indexOf(marker)
          if (idx >= 0) {
            const objectPath = row.file_url.slice(idx + marker.length)
            await supabase.storage.from('approval_attachments').remove([decodeURIComponent(objectPath)])
          }
        }
        let delQ = supabase.from('approval_doc_attachments').delete().eq('id', row.id)
        if (docId != null) delQ = delQ.eq('approval_doc_id', docId)
        const { error } = await delQ
        if (error) throw error
        await refreshAttachments()
      } catch (e: unknown) {
        setErrorMessage(e instanceof Error ? e.message : '첨부 삭제에 실패했습니다.')
      }
    },
    [canManage, docId, refreshAttachments]
  )

  const selectableDocs = useMemo(
    () =>
      eligibleDocs.map((row) => ({
        id: row.id,
        label: `${row.doc_no ?? `문서#${row.id}`} · ${row.title ?? '(제목 없음)'}`,
      })),
    [eligibleDocs]
  )

  const sourceInfoQuery = useMemo(() => {
    const q = new URLSearchParams()
    q.set('fromAttachment', '1')
    if (docId != null) q.set('fromDocId', String(docId))
    if (sourceDocNo?.trim()) q.set('fromDocNo', sourceDocNo.trim())
    if (sourceTitle?.trim()) q.set('fromDocTitle', sourceTitle.trim())
    return q.toString()
  }, [docId, sourceDocNo, sourceTitle])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-gray-500">첨부문서(파일 / 최종결재완료 기안문서)</p>
        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-800 hover:bg-gray-50">
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              파일 추가
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  void addUploadedFiles(e.target.files)
                  e.currentTarget.value = ''
                }}
                disabled={uploading}
              />
            </label>
          </div>
        ) : null}
      </div>

      {canManage ? (
        <div className="flex flex-col gap-2 rounded-md border border-gray-200 bg-gray-50 p-2 sm:flex-row sm:items-center">
          <select
            value={selectedDocId}
            onChange={(e) => setSelectedDocId(e.target.value)}
            className="h-9 min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 text-sm"
          >
            <option value="">첨부할 결재문서 선택 (최종결재완료 기안문서)</option>
            {selectableDocs.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
          <Button type="button" size="sm" variant="outline" onClick={() => void addRelatedDoc()} disabled={addingRelated}>
            {addingRelated ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Plus className="mr-1 size-3.5" />}
            문서 첨부
          </Button>
        </div>
      ) : null}

      {canManage && docId == null ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
          임시 첨부는 마지막 임시저장 시각 기준 72시간 후 자동 삭제됩니다. 임시저장할 때마다 만료 시간이 연장됩니다.
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{errorMessage}</div>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full min-w-[42rem] table-fixed text-sm">
          <colgroup>
            <col className="w-[7rem]" />
            <col />
            <col className="w-[8rem]" />
            <col className="w-[8.5rem]" />
            <col className="w-[8.5rem]" />
          </colgroup>
          <thead className="bg-gray-50 text-left text-xs font-black text-gray-500">
            <tr>
              <th className="px-3 py-2">구분</th>
              <th className="px-3 py-2">항목</th>
              <th className="px-3 py-2">용량</th>
              <th className="px-3 py-2">등록시각</th>
              <th className="px-3 py-2 text-center">동작</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-xs font-bold text-gray-400">
                  첨부 목록을 불러오는 중…
                </td>
              </tr>
            ) : attachments.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-xs font-bold text-gray-400">
                  등록된 첨부가 없습니다.
                </td>
              </tr>
            ) : (
              attachments.map((row) => {
                const related = row.related_approval_doc_id != null ? relatedDocMap.get(row.related_approval_doc_id) : null
                const isImage = row.attachment_kind === 'file' && isImageAttachment(row)
                const canPreview = supportsPreview(row)
                return (
                  <tr key={row.id}>
                    <td className="px-3 py-2 text-xs font-bold text-gray-700">
                      {row.attachment_kind === 'approval_doc' ? '결재문서' : isImage ? '이미지' : '파일'}
                    </td>
                    <td className="px-3 py-2">
                      {row.attachment_kind === 'approval_doc' ? (
                        related ? (
                          <button
                            type="button"
                            onClick={() =>
                              openApprovalShellPopup(
                                `/approvals/view/${related.id}?${sourceInfoQuery}`,
                                `approvalDocView_${related.id}`
                              )
                            }
                            className="inline-flex max-w-full items-center gap-1 truncate text-left text-xs font-black text-blue-700 hover:underline"
                            title={`${related.doc_no ?? `문서#${related.id}`} ${related.title ?? ''}`}
                          >
                            <Link2 className="size-3.5 shrink-0" />
                            <span className="truncate">{related.doc_no ?? `문서#${related.id}`}</span>
                            <span className="truncate text-gray-500">· {related.title ?? '(제목 없음)'}</span>
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-gray-400">연결 문서 정보 없음</span>
                        )
                      ) : (
                        <a
                          href={row.file_url ?? '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex max-w-full items-center gap-1 truncate text-xs font-bold text-blue-700 hover:underline"
                          title={row.file_name ?? row.file_url ?? '첨부 파일'}
                        >
                          <FileText className="size-3.5 shrink-0" />
                          <span className="truncate">{row.file_name ?? row.file_url ?? '첨부 파일'}</span>
                        </a>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs font-bold text-gray-500">{toReadableBytes(row.file_size)}</td>
                    <td className="px-3 py-2 text-xs font-bold text-gray-500">
                      {new Date(row.created_at).toLocaleString('ko-KR')}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-center gap-1">
                        {row.attachment_kind === 'approval_doc' && related ? (
                          <button
                            type="button"
                            onClick={() =>
                              openApprovalShellPopup(
                                `/approvals/view/${related.id}?${sourceInfoQuery}`,
                                `approvalDocView_${related.id}`
                              )
                            }
                            className="inline-flex h-7 items-center justify-center gap-1 rounded border border-gray-300 bg-white px-2 text-[11px] font-bold text-gray-700 hover:bg-gray-50"
                            title="문서 열기"
                          >
                            <ExternalLink className="size-3.5" />
                            열기
                          </button>
                        ) : null}
                        {row.attachment_kind === 'file' && row.file_url ? (
                          <>
                            <a
                              href={row.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              download={row.file_name ?? undefined}
                              className="inline-flex h-7 items-center justify-center gap-1 rounded border border-gray-300 bg-white px-2 text-[11px] font-bold text-gray-700 hover:bg-gray-50"
                              title="다운로드"
                            >
                              <Download className="size-3.5" />
                              다운
                            </a>
                            <button
                              type="button"
                              onClick={() => {
                                if (!canPreview) {
                                  setErrorMessage('해당 파일은 미리보기 기능을 지원하지 않습니다. 다운로드 후 확인해 주세요.')
                                  return
                                }
                                setOpenImageUrl(row.file_url)
                                setOpenImageAlt(row.file_name ?? '첨부 이미지')
                              }}
                              disabled={!canPreview}
                              className="inline-flex h-7 items-center justify-center gap-1 rounded border border-gray-300 bg-white px-2 text-[11px] font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400"
                              title={canPreview ? '라이트박스로 보기' : '미리보기 미지원 파일'}
                            >
                              {isImage ? <FileImage className="size-3.5" /> : <Eye className="size-3.5" />}
                              보기
                            </button>
                          </>
                        ) : null}
                        {canManage ? (
                          <button
                            type="button"
                            onClick={() => void deleteAttachment(row)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                            title="첨부 삭제"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={Boolean(openImageUrl)} onOpenChange={(v) => !v && setOpenImageUrl(null)}>
        <DialogContent
          showCloseButton
          overlayClassName="fixed inset-0 isolate z-50 bg-black/80 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
          className="max-h-[min(92vh,900px)] w-[min(96vw,1200px)] max-w-[min(96vw,1200px)] border-0 bg-zinc-950 p-3 text-white ring-white/10 sm:p-4"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>첨부 이미지 미리보기</DialogTitle>
            <DialogDescription>{ESC_HINT}</DialogDescription>
          </DialogHeader>
          {openImageUrl ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={openImageUrl} alt={openImageAlt} className="max-h-[min(78vh,820px)] w-auto max-w-full rounded-md object-contain shadow-lg" />
              <p className="text-center text-xs font-bold text-zinc-300 sm:text-sm">{ESC_HINT}</p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
