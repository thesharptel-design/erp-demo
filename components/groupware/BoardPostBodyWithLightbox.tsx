'use client'

import { useCallback, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const ESC_HINT = 'ESC 키를 누르면 사진 보기를 닫을 수 있습니다.'

type BoardPostBodyWithLightboxProps = {
  html: string
  className?: string
}

export default function BoardPostBodyWithLightbox({ html, className }: BoardPostBodyWithLightboxProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [lightboxAlt, setLightboxAlt] = useState('')

  const handleBodyClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement | null
    if (!el) return
    const img = el.closest('img')
    if (!img || !containerRef.current?.contains(img)) return
    const src = img.currentSrc || img.getAttribute('src') || ''
    if (!src.trim()) return
    e.preventDefault()
    e.stopPropagation()
    setLightboxSrc(src)
    setLightboxAlt(img.alt || '게시글 이미지')
    setOpen(true)
  }, [])

  return (
    <>
      <div
        ref={containerRef}
        role="presentation"
        className={cn(
          '[&_img]:cursor-zoom-in [&_img]:transition-opacity hover:[&_img]:opacity-95',
          className
        )}
        onClick={handleBodyClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton
          overlayClassName="fixed inset-0 isolate z-50 bg-black/80 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
          className={cn(
            'max-h-[min(92vh,900px)] w-[min(96vw,1200px)] max-w-[min(96vw,1200px)] gap-3 border-0 bg-zinc-950 p-3 text-white ring-white/10 sm:max-w-[min(96vw,1200px)] sm:p-4',
            /* 라이트박스 닫기(X): 더 크고 대비 강하게 */
            '[&_[data-slot=dialog-close]]:!h-11 [&_[data-slot=dialog-close]]:!w-11 [&_[data-slot=dialog-close]]:!min-h-11 [&_[data-slot=dialog-close]]:!min-w-11',
            '[&_[data-slot=dialog-close]]:rounded-xl [&_[data-slot=dialog-close]]:border-2 [&_[data-slot=dialog-close]]:border-white/35',
            '[&_[data-slot=dialog-close]]:!bg-black/55 [&_[data-slot=dialog-close]]:!text-white shadow-md',
            'hover:[&_[data-slot=dialog-close]]:!bg-black/75 hover:[&_[data-slot=dialog-close]]:!text-white hover:[&_[data-slot=dialog-close]]:border-white/50',
            '[&_[data-slot=dialog-close]_svg]:!size-6 [&_[data-slot=dialog-close]_svg]:!shrink-0 [&_[data-slot=dialog-close]_svg]:stroke-[2.75]',
            '[&_[data-slot=dialog-close]]:!top-3 [&_[data-slot=dialog-close]]:!right-3'
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>이미지 크게 보기</DialogTitle>
            <DialogDescription>{ESC_HINT}</DialogDescription>
          </DialogHeader>
          {lightboxSrc ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- 사용자 게시 HTML 원본 URL */}
              <img
                src={lightboxSrc}
                alt={lightboxAlt}
                className="max-h-[min(78vh,820px)] w-auto max-w-full rounded-md object-contain shadow-lg"
              />
              <p className="text-center text-xs font-bold text-zinc-300 sm:text-sm" aria-hidden>
                {ESC_HINT}
              </p>
              <p className="text-center text-[11px] text-zinc-500">배경을 누르거나 우측 상단 X로도 닫을 수 있습니다.</p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
