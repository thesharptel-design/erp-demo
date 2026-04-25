'use client'

import { Color } from '@tiptap/extension-color'
import { Highlight } from '@tiptap/extension-highlight'
import { Image } from '@tiptap/extension-image'
import { Placeholder } from '@tiptap/extension-placeholder'
import { TextAlign } from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { Underline } from '@tiptap/extension-underline'
import { Extension, type Editor } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import type { EditorView } from '@tiptap/pm/view'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Strikethrough,
  Type,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react'
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
const FONT_FAMILY_OPTIONS = [
  { label: '기본', value: '' },
  { label: '맑은 고딕', value: '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif' },
  { label: '굴림', value: 'Gulim, "굴림", sans-serif' },
  { label: '돋움', value: 'Dotum, "돋움", sans-serif' },
  { label: '궁서', value: 'Gungsuh, "궁서", serif' },
  { label: '바탕', value: 'Batang, "바탕", serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
]
const FONT_SIZE_VALUES = [6, 8, 10, 12, 14, 16, 18, 22, 26, 30, 34]
const FONT_SIZE_OPTIONS = FONT_SIZE_VALUES.map((size) => ({ label: `${size}px`, value: `${size}px` }))
const TEXT_COLOR_PRESETS = ['#E60000', '#FF1F1F', '#F2C200', '#E7E500', '#8BC34A', '#00A651', '#17A2D8', '#1D70B8', '#0D2A73', '#6A329F']
const HIGHLIGHT_COLOR_PRESETS = [...TEXT_COLOR_PRESETS]

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (fontSize: string) => ReturnType
      unsetFontSize: () => ReturnType
    }
    fontFamily: {
      setFontFamily: (fontFamily: string) => ReturnType
      unsetFontFamily: () => ReturnType
    }
  }
}

const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() {
    return {
      types: ['textStyle'],
    }
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style.fontSize || null,
            renderHTML: (attributes: { fontSize?: string | null }) => {
              if (!attributes.fontSize) return {}
              return { style: `font-size: ${attributes.fontSize}` }
            },
          },
        },
      },
    ]
  },
  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    }
  },
})

const FontFamily = Extension.create({
  name: 'fontFamily',
  addOptions() {
    return {
      types: ['textStyle'],
    }
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style.fontFamily || null,
            renderHTML: (attributes: { fontFamily?: string | null }) => {
              if (!attributes.fontFamily) return {}
              return { style: `font-family: ${attributes.fontFamily}` }
            },
          },
        },
      },
    ]
  },
  addCommands() {
    return {
      setFontFamily:
        (fontFamily: string) =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontFamily }).run(),
      unsetFontFamily:
        () =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontFamily: null }).removeEmptyTextStyle().run(),
    }
  },
})

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
  const [showTextColorPalette, setShowTextColorPalette] = useState(false)
  const [showHighlightPalette, setShowHighlightPalette] = useState(false)
  const editorRef = useRef<Editor | null>(null)
  const disabledRef = useRef(disabled)
  const colorMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    disabledRef.current = disabled
  }, [disabled])

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (colorMenuRef.current?.contains(target)) return
      setShowTextColorPalette(false)
      setShowHighlightPalette(false)
    }
    if (!showTextColorPalette && !showHighlightPalette) return
    window.addEventListener('mousedown', onClickOutside)
    return () => window.removeEventListener('mousedown', onClickOutside)
  }, [showHighlightPalette, showTextColorPalette])

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
      FontSize,
      FontFamily,
      Color,
      Highlight.configure({ multicolor: true }),
      Underline,
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
    'inline-flex h-7 min-w-7 items-center justify-center rounded border border-gray-300 bg-white px-1.5 text-[12px] font-black text-gray-800 hover:bg-gray-100 disabled:opacity-40'
  const btnOn =
    'inline-flex h-7 min-w-7 items-center justify-center rounded border border-blue-700 bg-blue-100 px-1.5 text-[12px] font-black text-blue-900'
  const sep = <span className="mx-1 text-gray-300">|</span>

  const toolbarRowStyle = 'flex flex-wrap items-center gap-1 border-b border-gray-300 bg-[#f3f3f3] p-1.5'
  const currentFontSize = (editor.getAttributes('textStyle').fontSize as string | undefined) ?? '10px'
  const currentFontFamily = (editor.getAttributes('textStyle').fontFamily as string | undefined) ?? ''
  const currentTextColor = (editor.getAttributes('textStyle').color as string | undefined)?.toUpperCase() ?? ''
  const currentHighlightColor = (editor.getAttributes('highlight').color as string | undefined)?.toUpperCase() ?? ''

  const toolbarMarksAlignLists = (
    <>
      <button type="button" className={btn} onClick={() => editor.chain().focus().undo().run()} title="실행 취소">
        <Undo2 className="h-4 w-4" />
      </button>
      <button type="button" className={btn} onClick={() => editor.chain().focus().redo().run()} title="다시 실행">
        <Redo2 className="h-4 w-4" />
      </button>
      {sep}
      <select
        className="h-8 rounded border border-gray-300 bg-white px-2 text-xs font-bold text-gray-800"
        value={currentFontFamily}
        onChange={(e) => {
          const next = e.target.value
          if (!next) {
            editor.chain().focus().unsetFontFamily().run()
            return
          }
          editor.chain().focus().setFontFamily(next).run()
        }}
      >
        {FONT_FAMILY_OPTIONS.map((option) => (
          <option key={option.label} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <select
        className="h-8 rounded border border-gray-300 bg-white px-2 text-xs font-bold text-gray-800"
        value={currentFontSize}
        onChange={(e) => {
          const next = e.target.value
          if (!next) {
            editor.chain().focus().unsetFontSize().run()
            return
          }
          editor.chain().focus().setFontSize(next).run()
        }}
      >
        {FONT_SIZE_OPTIONS.map((option) => (
          <option key={option.label} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {sep}
      <div className="relative" ref={colorMenuRef}>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`${btn} px-1`}
            onClick={() => {
              setShowTextColorPalette((prev) => !prev)
              setShowHighlightPalette(false)
            }}
            title="글자색"
          >
            <Type className="h-4 w-4 text-blue-600" />
          </button>
          <button
            type="button"
            className={`${btn} px-1`}
            onClick={() => {
              setShowHighlightPalette((prev) => !prev)
              setShowTextColorPalette(false)
            }}
            title="하이라이트"
          >
            <Highlighter className="h-4 w-4 text-yellow-500" />
          </button>
        </div>
        {showTextColorPalette || showHighlightPalette ? (
          <div className="absolute left-0 top-9 z-20 min-w-[460px] rounded-md border border-gray-300 bg-white p-2 shadow-lg">
            {showTextColorPalette ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gray-600">글자색</span>
                  <button
                    type="button"
                    className="inline-flex h-6 items-center gap-1 rounded-sm border border-gray-300 bg-white px-1.5 text-[11px] font-bold text-gray-700 hover:bg-gray-100"
                    onClick={() => {
                      editor.chain().focus().unsetColor().run()
                      setShowTextColorPalette(false)
                    }}
                    title="글자색 지우기"
                  >
                    <Type className="h-3.5 w-3.5" />
                    지우기
                  </button>
                </div>
                <div className="grid grid-cols-10 gap-0">
                    {TEXT_COLOR_PRESETS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`h-6 w-6 rounded-sm border ${currentTextColor === color ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-400'}`}
                        style={{ backgroundColor: color }}
                        onClick={() => {
                          editor.chain().focus().setColor(color).run()
                          setShowTextColorPalette(false)
                        }}
                        aria-label={`글자색 ${color}`}
                        title={color}
                      />
                    ))}
                </div>
              </div>
            ) : null}
            {showHighlightPalette ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gray-600">하이라이트</span>
                  <button
                    type="button"
                    className="inline-flex h-6 items-center gap-1 rounded-sm border border-gray-300 bg-white px-1.5 text-[11px] font-bold text-gray-700 hover:bg-gray-100"
                    onClick={() => {
                      editor.chain().focus().unsetHighlight().run()
                      setShowHighlightPalette(false)
                    }}
                    title="하이라이트 지우기"
                  >
                    <Highlighter className="h-3.5 w-3.5" />
                    지우기
                  </button>
                </div>
                <div className="grid grid-cols-10 gap-0">
                    {HIGHLIGHT_COLOR_PRESETS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`h-6 w-6 rounded-sm border ${currentHighlightColor === color ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-400'}`}
                        style={{ backgroundColor: color }}
                        onClick={() => {
                          editor.chain().focus().setHighlight({ color }).run()
                          setShowHighlightPalette(false)
                        }}
                        aria-label={`하이라이트 ${color}`}
                        title={color}
                      />
                    ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className={editor.isActive('bold') ? btnOn : btn}
        onClick={() => editor.chain().focus().toggleBold().run()}
        aria-label="굵게"
        title="굵게"
      >
        <Bold className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={editor.isActive('italic') ? btnOn : btn}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        aria-label="기울임"
        title="기울임"
      >
        <Italic className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={editor.isActive('underline') ? btnOn : btn}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        aria-label="밑줄"
        title="밑줄"
      >
        <UnderlineIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={editor.isActive('strike') ? btnOn : btn}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        aria-label="취소선"
        title="취소선"
      >
        <Strikethrough className="h-4 w-4" />
      </button>
      {sep}
      <button
        type="button"
        className={editor.isActive({ textAlign: 'left' }) ? btnOn : btn}
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        aria-label="왼쪽 정렬"
        title="왼쪽 정렬"
      >
        <AlignLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={editor.isActive({ textAlign: 'center' }) ? btnOn : btn}
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        aria-label="가운데 정렬"
        title="가운데 정렬"
      >
        <AlignCenter className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={editor.isActive({ textAlign: 'right' }) ? btnOn : btn}
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        aria-label="오른쪽 정렬"
        title="오른쪽 정렬"
      >
        <AlignRight className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={editor.isActive({ textAlign: 'justify' }) ? btnOn : btn}
        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
        aria-label="양쪽 정렬"
        title="양쪽 정렬"
      >
        <AlignJustify className="h-4 w-4" />
      </button>
      {sep}
      <button
        type="button"
        className={editor.isActive('bulletList') ? btnOn : btn}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        aria-label="글머리 기호"
        title="글머리 기호"
      >
        <List className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={editor.isActive('orderedList') ? btnOn : btn}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        aria-label="번호 목록"
        title="번호 목록"
      >
        <ListOrdered className="h-4 w-4" />
      </button>
    </>
  )

  return (
    <div className="space-y-1">
      <div
        className={`rounded border border-gray-300 bg-gray-50 ${disabled ? 'pointer-events-none opacity-60' : ''}`}
      >
        <div className={`${toolbarRowStyle} ${splitToolbar ? 'border-gray-200' : ''}`}>{toolbarMarksAlignLists}</div>
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
