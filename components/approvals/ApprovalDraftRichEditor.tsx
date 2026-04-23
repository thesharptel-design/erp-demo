'use client'

import { Color } from '@tiptap/extension-color'
import { Image } from '@tiptap/extension-image'
import { Placeholder } from '@tiptap/extension-placeholder'
import { TextAlign } from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import type { Editor } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import type { EditorView } from '@tiptap/pm/view'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isHtmlContentEffectivelyEmpty, plainTextToSafeEditorHtml } from '@/lib/html-content'

type ApprovalDraftRichEditorProps = {
  value: string
  onChange: (html: string) => void
  disabled?: boolean
  placeholder?: string
  /** Defaults to `/api/approvals/attachments/upload`. */
  imageUploadUrl?: string
  /** Shown in the image upload help line (e.g. `board_attachments`). */
  attachmentStorageKey?: string
  /** Appended to the editable surface class (e.g. larger `min-h-*` for board). */
  editorSurfaceClassName?: string
  /** Second toolbar row (e.g. board “FMKorea-style” chrome). */
  splitToolbar?: boolean
}

function toInitialContent(raw: string): string {
  if (!raw.trim()) return '<p></p>'
  return plainTextToSafeEditorHtml(raw)
}

function firstImageFromClipboard(event: ClipboardEvent): File | null {
  const cd = event.clipboardData
  if (!cd) return null
  if (cd.files?.length) {
    for (const f of Array.from(cd.files)) {
      if (f.type.startsWith('image/')) return f
    }
  }
  for (const item of Array.from(cd.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile()
      if (f) return f
    }
  }
  return null
}

function firstImageFromDataTransfer(dt: DataTransfer | null): File | null {
  if (!dt?.files?.length) return null
  for (const f of Array.from(dt.files)) {
    if (f.type.startsWith('image/')) return f
  }
  return null
}

const DEFAULT_IMAGE_UPLOAD_URL = '/api/approvals/attachments/upload'
const DEFAULT_ATTACHMENT_STORAGE_KEY = 'approval_attachments'

export default function ApprovalDraftRichEditor({
  value,
  onChange,
  disabled,
  placeholder = '업무기안 내용을 입력하세요',
  imageUploadUrl = DEFAULT_IMAGE_UPLOAD_URL,
  attachmentStorageKey = DEFAULT_ATTACHMENT_STORAGE_KEY,
  editorSurfaceClassName = '',
  splitToolbar = false,
}: ApprovalDraftRichEditorProps) {
  const [uploadErrorMessage, setUploadErrorMessage] = useState('')
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const editorRef = useRef<Editor | null>(null)
  const disabledRef = useRef(disabled)

  useEffect(() => {
    disabledRef.current = disabled
  }, [disabled])

  const uploadImageFile = useCallback(async (file: File): Promise<string> => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.access_token) {
      throw new Error('로그인 세션이 만료되어 이미지를 업로드할 수 없습니다.')
    }
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch(imageUploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: formData,
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(payload?.error ?? '이미지 업로드에 실패했습니다.')
    }
    if (!payload?.publicUrl || typeof payload.publicUrl !== 'string') {
      throw new Error('업로드 URL을 확인할 수 없습니다.')
    }
    return payload.publicUrl as string
  }, [imageUploadUrl])

  const uploadAndInsertImage = useCallback(
    async (ed: Editor, file: File, dropPos?: number | null) => {
      try {
        setUploadErrorMessage('')
        setIsUploadingImage(true)
        const url = await uploadImageFile(file)
        const chain = ed.chain().focus()
        if (dropPos != null && dropPos >= 0) {
          chain.setTextSelection(dropPos).setImage({ src: url }).run()
        } else {
          chain.setImage({ src: url }).run()
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : '이미지 업로드 중 오류가 발생했습니다.'
        setUploadErrorMessage(message)
      } finally {
        setIsUploadingImage(false)
      }
    },
    [uploadImageFile]
  )

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
        link: { openOnClick: false, autolink: true },
      }),
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder }),
      Image.configure({ allowBase64: false }),
    ],
    enableInputRules: false,
    content: toInitialContent(value),
    editable: !disabled,
    editorProps: {
      attributes: {
        class: [
          'focus:outline-none min-h-[200px] px-3 py-2 text-sm leading-relaxed text-gray-900',
          '[&_img]:max-h-80 [&_img]:max-w-full [&_img]:rounded [&_img]:border [&_img]:border-gray-200',
          '[&_li]:my-0.5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-6',
          editorSurfaceClassName,
        ]
          .filter(Boolean)
          .join(' '),
      },
      handlePaste(_view: EditorView, event: ClipboardEvent) {
        if (disabledRef.current) return false
        const file = firstImageFromClipboard(event)
        if (!file) return false
        event.preventDefault()
        const ed = editorRef.current
        if (!ed) return true
        void uploadAndInsertImage(ed, file)
        return true
      },
      handleDrop(view: EditorView, event: DragEvent, _slice, moved: boolean) {
        if (disabledRef.current || moved) return false
        const file = firstImageFromDataTransfer(event.dataTransfer)
        if (!file) return false
        event.preventDefault()
        const ed = editorRef.current
        if (!ed) return true
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
        const pos = coords?.pos ?? null
        void uploadAndInsertImage(ed, file, pos)
        return true
      },
      handleDOMEvents: {
        dragover: (_view, domEvent) => {
          if (disabledRef.current) return false
          const e = domEvent as DragEvent
          if (firstImageFromDataTransfer(e.dataTransfer)) {
            e.preventDefault()
            return true
          }
          return false
        },
      },
    },
    onCreate: ({ editor: ed }) => {
      editorRef.current = ed
    },
    onDestroy: () => {
      editorRef.current = null
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML()
      onChange(isHtmlContentEffectivelyEmpty(html) ? '' : html)
    },
  })

  useEffect(() => {
    editorRef.current = editor ?? null
    return () => {
      editorRef.current = null
    }
  }, [editor])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const next = toInitialContent(value)
    if (editor.getHTML() === next) return
    editor.commands.setContent(next, { emitUpdate: false })
  }, [value, editor])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor.setEditable(!disabled)
  }, [disabled, editor])

  const insertImage = useCallback(async () => {
    if (!editor) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file?.type.startsWith('image/')) return
      void uploadAndInsertImage(editor, file)
    }
    input.click()
  }, [editor, uploadAndInsertImage])

  const setLink = useCallback(() => {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    const url = typeof window !== 'undefined' ? window.prompt('링크 URL', prev ?? 'https://') : null
    if (url === null) return
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }, [editor])

  if (!editor) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded border border-gray-300 bg-gray-50 text-sm font-bold text-gray-500">
        에디터 준비 중…
      </div>
    )
  }

  const btn =
    'rounded border border-gray-300 bg-white px-2 py-1 text-[11px] font-black text-gray-800 hover:bg-gray-50 disabled:opacity-40'
  const btnOn = 'rounded border border-blue-600 bg-blue-50 px-2 py-1 text-[11px] font-black text-blue-800'
  const sep = <span className="mx-1 text-gray-300">|</span>

  const toolbarRowStyle = 'flex flex-wrap items-center gap-1 border-b border-gray-300 bg-gray-100 p-1.5'

  const toolbarMarksAlignLists = (
    <>
      <button
        type="button"
        className={editor.isActive('bold') ? btnOn : btn}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        굵게
      </button>
      <button
        type="button"
        className={editor.isActive('italic') ? btnOn : btn}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        기울임
      </button>
      <button
        type="button"
        className={editor.isActive('underline') ? btnOn : btn}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        밑줄
      </button>
      <button
        type="button"
        className={editor.isActive('strike') ? btnOn : btn}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        취소선
      </button>
      {sep}
      <button
        type="button"
        className={editor.isActive({ textAlign: 'left' }) ? btnOn : btn}
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
      >
        왼쪽
      </button>
      <button
        type="button"
        className={editor.isActive({ textAlign: 'center' }) ? btnOn : btn}
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
      >
        가운데
      </button>
      <button
        type="button"
        className={editor.isActive({ textAlign: 'right' }) ? btnOn : btn}
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
      >
        오른쪽
      </button>
      <button
        type="button"
        className={editor.isActive({ textAlign: 'justify' }) ? btnOn : btn}
        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
      >
        양쪽
      </button>
      {sep}
      <button
        type="button"
        className={editor.isActive('bulletList') ? btnOn : btn}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        글머리
      </button>
      <button
        type="button"
        className={editor.isActive('orderedList') ? btnOn : btn}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        번호
      </button>
    </>
  )

  const toolbarHeadingsColorMedia = (
    <>
      <button type="button" className={btn} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        소제목
      </button>
      <button type="button" className={btn} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        인용
      </button>
      {sep}
      <label className={`${btn} inline-flex cursor-pointer items-center gap-1`}>
        글자색
        <input
          type="color"
          className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
          onInput={(e) => editor.chain().focus().setColor(e.currentTarget.value).run()}
        />
      </label>
      <button type="button" className={btn} onClick={() => editor.chain().focus().unsetColor().run()}>
        색 지우기
      </button>
      {sep}
      <button type="button" className={btn} onClick={setLink}>
        링크
      </button>
      <button type="button" className={btn} onClick={() => void insertImage()}>
        이미지
      </button>
    </>
  )

  return (
    <div className="space-y-1">
      <div
        className={`rounded border border-gray-300 bg-gray-50 ${disabled ? 'pointer-events-none opacity-60' : ''}`}
      >
        {splitToolbar ? (
          <>
            <div className={`${toolbarRowStyle} border-gray-200`}>{toolbarMarksAlignLists}</div>
            <div className={toolbarRowStyle}>{toolbarHeadingsColorMedia}</div>
          </>
        ) : (
          <div className={toolbarRowStyle}>
            {toolbarMarksAlignLists}
            {sep}
            {toolbarHeadingsColorMedia}
          </div>
        )}
        <EditorContent editor={editor} className="approval-tiptap-editor bg-white" />
      </div>
      <p className="text-[11px] font-bold text-gray-500">
        이미지는 툴바의 &quot;이미지&quot;뿐 아니라 <strong className="text-gray-700">Ctrl+V 붙여넣기</strong>나{' '}
        <strong className="text-gray-700">에디터 안으로 드래그 앤 드롭</strong>해도{' '}
        <code className="rounded bg-gray-200 px-1">{attachmentStorageKey}</code> 저장소에 올린 뒤 본문에 URL이
        들어갑니다.
      </p>
      {isUploadingImage && <p className="text-[11px] font-bold text-blue-600">이미지 업로드 중...</p>}
      {uploadErrorMessage && <p className="text-[11px] font-bold text-red-600">{uploadErrorMessage}</p>}
    </div>
  )
}
