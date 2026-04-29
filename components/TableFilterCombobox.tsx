'use client'

import SearchableCombobox from '@/components/SearchableCombobox'
import { cn } from '@/lib/utils'

type TableFilterComboboxProps = React.ComponentProps<typeof SearchableCombobox>

/**
 * Table header filter combobox:
 * - Always follows current column width (`w-full min-w-0`)
 * - Keeps compact visual density for table filter rows
 */
export default function TableFilterCombobox({
  buttonClassName,
  className,
  ...props
}: TableFilterComboboxProps) {
  return (
    <SearchableCombobox
      {...props}
      className={cn('w-full min-w-0', className)}
      buttonClassName={cn('w-full min-w-0 text-[11px]', buttonClassName)}
    />
  )
}
