'use client'

import ApprovalDraftRichEditor from '@/components/approvals/ApprovalDraftRichEditor'
import { Paperclip } from 'lucide-react'
import type { ReactNode } from 'react'

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
  titlePlaceholder?: string
  bodyPlaceholder?: string
  categoryLabel?: string
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
  titlePlaceholder = '제목을 입력하세요',
  bodyPlaceholder = '내용을 입력하세요',
  categoryLabel = '분류',
}: BoardPostEditorProps) {
  const categoryId = 'board-post-category'
  const titleId = 'board-post-title'

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
            <p className="text-gray-500">별도 파일 첨부 UI는 다음 단계에서 연결할 수 있습니다.</p>
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
