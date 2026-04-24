'use client'

import ApprovalDraftRichEditor from '@/components/approvals/ApprovalDraftRichEditor'
import { Paperclip } from 'lucide-react'
import { useCallback, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

export type BoardCategoryOption = {
  value: string
  label: string
}

const BOARD_IMAGE_UPLOAD_URL = '/api/groupware/board/attachments/upload'

export type BoardPostEditorProps = {
  categories: BoardCategoryOption[]
  category: string
  onCategoryChange: (value: string) => void
  title: string
  onTitleChange: (value: string) => void
  bodyHtml: string
  onBodyHtmlChange: (html: string) => void
  disabled?: boolean
  /** 관리자만 공지 체크박스 표시 */
  canWriteNotice?: boolean
  isNotice?: boolean
  onIsNoticeChange?: (value: boolean) => void
  /** 하단 버튼 줄(저장·취소 등) */
  footer?: ReactNode
  /** 시스템 관리자 전용: PDF 업로드/링크 추출 버튼 표시 */
  canExtractPdfLinks?: boolean
  titlePlaceholder?: string
  bodyPlaceholder?: string
  categoryLabel?: string
}

function escapeHtmlText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export default function BoardPostEditor({
  categories,
  category,
  onCategoryChange,
  title,
  onTitleChange,
  bodyHtml,
  onBodyHtmlChange,
  disabled,
  canWriteNotice,
  isNotice,
  onIsNoticeChange,
  footer,
  canExtractPdfLinks = false,
  titlePlaceholder = '제목을 입력하세요',
  bodyPlaceholder = '내용을 입력하세요',
  categoryLabel = '분류',
}: BoardPostEditorProps) {
  const categoryId = 'board-post-category'
  const titleId = 'board-post-title'
  const [isExtractingPdfLinks, setIsExtractingPdfLinks] = useState(false)
  const [pdfExtractMessage, setPdfExtractMessage] = useState('')
  const [isUploadingPdf, setIsUploadingPdf] = useState(false)

  const handlePdfFilePick = useCallback(
    async (file: File | null) => {
      if (!file || disabled || !canExtractPdfLinks) return

      setPdfExtractMessage('')
      setIsExtractingPdfLinks(true)
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session?.access_token) {
          throw new Error('로그인 세션이 만료되어 PDF 링크 추출을 진행할 수 없습니다.')
        }

        const formData = new FormData()
        formData.append('file', file)
        const response = await fetch('/api/groupware/board/attachments/extract-links', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: formData,
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(payload?.error ?? 'PDF 링크 추출에 실패했습니다.')
        }

        const links = Array.isArray(payload?.links)
          ? payload.links.filter((v: unknown): v is string => typeof v === 'string' && v.trim().length > 0)
          : []
        const linkItems = Array.isArray(payload?.linkItems)
          ? payload.linkItems
            .map((item: unknown) => {
              if (!item || typeof item !== 'object') return null
              const record = item as { url?: unknown; title?: unknown }
              if (typeof record.url !== 'string' || !record.url.trim()) return null
              return {
                url: record.url,
                title: typeof record.title === 'string' && record.title.trim() ? record.title.trim() : record.url,
              }
            })
            .filter((item: { url: string; title: string } | null): item is { url: string; title: string } => item != null)
          : []

        const escapedFileName = escapeHtmlText(file.name)
        const linksHtml = (linkItems.length || links.length)
          ? `<ol>${(linkItems.length ? linkItems : links.map((url: string) => ({ url, title: url })))
            .map((item: { url: string; title: string }) => {
              const safeUrl = escapeHtmlText(item.url)
              const safeTitle = escapeHtmlText(item.title)
              return `<li><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeTitle}</a><br/><span>${safeUrl}</span></li>`
            })
            .join('')}</ol>`
          : '<p>PDF에서 링크를 찾지 못했습니다.</p>'

        const block = `<p><strong>PDF 링크 추출: ${escapedFileName}</strong></p>${linksHtml}`
        onBodyHtmlChange(bodyHtml.trim() ? `${bodyHtml}${block}` : block)
        setPdfExtractMessage(
          links.length
            ? `PDF 링크 ${links.length}개를 본문에 추가했습니다.`
            : '추출 가능한 링크가 없어 안내 문구만 추가했습니다.'
        )
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'PDF 링크 추출 중 오류가 발생했습니다.'
        setPdfExtractMessage(msg)
      } finally {
        setIsExtractingPdfLinks(false)
      }
    },
    [bodyHtml, canExtractPdfLinks, disabled, onBodyHtmlChange]
  )

  const handlePdfUploadPick = useCallback(
    async (file: File | null) => {
      if (!file || disabled || !canExtractPdfLinks) return

      setPdfExtractMessage('')
      setIsUploadingPdf(true)
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session?.access_token) {
          throw new Error('로그인 세션이 만료되어 PDF 업로드를 진행할 수 없습니다.')
        }

        const formData = new FormData()
        formData.append('file', file)
        const response = await fetch(BOARD_IMAGE_UPLOAD_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: formData,
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(payload?.error ?? 'PDF 업로드에 실패했습니다.')
        }

        const publicUrl = typeof payload?.publicUrl === 'string' ? payload.publicUrl.trim() : ''
        if (!publicUrl) throw new Error('PDF 업로드 URL을 확인할 수 없습니다.')

        const escapedFileName = escapeHtmlText(file.name)
        const safeUrl = escapeHtmlText(publicUrl)
        const linkBlock = `<p><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">📄 ${escapedFileName}</a></p>`
        onBodyHtmlChange(bodyHtml.trim() ? `${bodyHtml}${linkBlock}` : linkBlock)
        setPdfExtractMessage('PDF 업로드 링크를 본문에 추가했습니다.')
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'PDF 업로드 중 오류가 발생했습니다.'
        setPdfExtractMessage(msg)
      } finally {
        setIsUploadingPdf(false)
      }
    },
    [bodyHtml, canExtractPdfLinks, disabled, onBodyHtmlChange]
  )

  return (
    <div className="space-y-3 rounded-lg border border-gray-300 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3">
        <div className="flex w-full flex-col gap-1 sm:w-44 sm:flex-shrink-0">
          <label htmlFor={categoryId} className="text-xs font-bold text-gray-600">
            {categoryLabel}
          </label>
          <select
            id={categoryId}
            className="h-10 w-full rounded border border-gray-300 bg-gray-50 px-2 text-sm font-semibold text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
            value={category}
            disabled={disabled}
            onChange={(e) => onCategoryChange(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={titleId} className="text-xs font-bold text-gray-600">
            제목
          </label>
          <input
            id={titleId}
            type="text"
            value={title}
            disabled={disabled}
            placeholder={titlePlaceholder}
            onChange={(e) => onTitleChange(e.target.value)}
            className="h-10 w-full min-w-0 rounded border border-gray-300 px-3 text-sm font-semibold text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
          />
        </div>
      </div>

      <ApprovalDraftRichEditor
        value={bodyHtml}
        onChange={onBodyHtmlChange}
        disabled={disabled}
        placeholder={bodyPlaceholder}
        imageUploadUrl={BOARD_IMAGE_UPLOAD_URL}
        attachmentStorageKey="board_attachments"
        splitToolbar
        editorSurfaceClassName="min-h-[280px] sm:min-h-[360px]"
      />

      <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <Paperclip className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-500" aria-hidden />
          <div className="min-w-0 space-y-1 text-xs leading-snug text-gray-600">
            <p className="font-bold text-gray-700">첨부·이미지 안내</p>
            <p>
              본문 안에 넣는 그림은 자동으로 <code className="rounded bg-gray-200 px-1">board_attachments</code>{' '}
              저장소에 올라갑니다. 파일당 최대 10MB, 이미지 형식만 가능합니다.
            </p>
            <p>
              링크가 걸린 텍스트를 붙여넣으면 링크도 함께 유지될 수 있습니다. 다만 PDF/이미지처럼 원본에서 링크
              정보를 주지 않으면 텍스트만 붙여넣어집니다.
            </p>
            <p className="text-gray-500">별도 파일 첨부 UI는 다음 단계에서 확장할 수 있습니다.</p>
            {canExtractPdfLinks ? (
              <div className="pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center justify-center rounded border border-gray-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-gray-700 hover:bg-gray-100">
                    {isUploadingPdf ? 'PDF 업로드 중…' : 'PDF 업로드'}
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      disabled={disabled || isUploadingPdf || isExtractingPdfLinks}
                      onChange={(e) => {
                        const selected = e.target.files?.[0] ?? null
                        void handlePdfUploadPick(selected)
                        e.currentTarget.value = ''
                      }}
                    />
                  </label>
                  <label className="inline-flex cursor-pointer items-center justify-center rounded border border-gray-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-gray-700 hover:bg-gray-100">
                    {isExtractingPdfLinks ? 'PDF 링크 추출 중…' : 'PDF 업로드 후 링크 추출'}
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      disabled={disabled || isExtractingPdfLinks || isUploadingPdf}
                      onChange={(e) => {
                        const selected = e.target.files?.[0] ?? null
                        void handlePdfFilePick(selected)
                        e.currentTarget.value = ''
                      }}
                    />
                  </label>
                </div>
                <p className="mt-1 text-[11px] text-gray-500">시스템 관리자만 사용할 수 있습니다. PDF 최대 10MB.</p>
              </div>
            ) : null}
            {pdfExtractMessage ? (
              <p
                className={`text-[11px] font-bold ${pdfExtractMessage.includes('실패') || pdfExtractMessage.includes('오류') ? 'text-red-600' : 'text-blue-700'}`}
              >
                {pdfExtractMessage}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {(canWriteNotice && onIsNoticeChange) || footer ? (
        <div className="flex flex-col gap-3 border-t border-gray-200 pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          {canWriteNotice && onIsNoticeChange ? (
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-gray-800">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                checked={Boolean(isNotice)}
                disabled={disabled}
                onChange={(e) => onIsNoticeChange(e.target.checked)}
              />
              공지로 등록
            </label>
          ) : null}
          {footer ? (
            <div className="flex flex-wrap items-center gap-2 sm:ms-auto sm:justify-end">{footer}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
