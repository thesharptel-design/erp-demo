'use client'

import { memo } from 'react'

function displayText(value: string | null | undefined, empty = '—') {
  const s = value == null ? '' : String(value).trim()
  return s || empty
}

type TruncateTextProps = {
  text: string | null | undefined
  className?: string
  empty?: string
}

function TruncateTextBase({ text, className, empty }: TruncateTextProps) {
  const display = displayText(text, empty ?? '—')
  return (
    <span className={`block min-w-0 truncate ${className ?? ''}`} title={display}>
      {display}
    </span>
  )
}

export const TruncateText = memo(TruncateTextBase)

type LinkTruncateTextProps = {
  href: string
  text: string | null | undefined
  onOpen: (e: React.MouseEvent<HTMLAnchorElement>) => void
  className?: string
  empty?: string
}

function LinkTruncateTextBase({
  href,
  text,
  onOpen,
  className,
  empty,
}: LinkTruncateTextProps) {
  const display = displayText(text, empty ?? '—')
  return (
    <a href={href} onClick={onOpen} className={className} title={display}>
      {display}
    </a>
  )
}

export const LinkTruncateText = memo(LinkTruncateTextBase)

export { displayText }
