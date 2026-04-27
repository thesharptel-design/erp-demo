'use client'

import * as React from 'react'
import { ChevronsUpDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type TransferComboboxOption = {
  value: string
  label: string
  keywords?: string[]
  disabled?: boolean
}

type Props = {
  value: string
  onChange: (value: string) => void
  options: TransferComboboxOption[]
  placeholder?: string
  /** Popover search input placeholder; defaults to `placeholder`. */
  commandInputPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  showClearOption?: boolean
  /** Trigger shows placeholder even when value matches an option (e.g. warehouse "all"). */
  triggerPlaceholderValues?: string[]
  listClassName?: string
  triggerClassName?: string
  contentClassName?: string
  align?: 'start' | 'center' | 'end'
}

export function InventoryTransferCommandCombobox({
  value,
  onChange,
  options,
  placeholder = '검색 또는 선택',
  commandInputPlaceholder,
  emptyText = '검색 결과가 없습니다.',
  disabled = false,
  showClearOption = true,
  triggerPlaceholderValues,
  listClassName = 'max-h-80',
  triggerClassName,
  contentClassName,
  align = 'start',
}: Props) {
  const [open, setOpen] = React.useState(false)

  const selected = React.useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value]
  )

  const displayLabel = React.useMemo(() => {
    if (triggerPlaceholderValues?.includes(value)) return null
    return selected?.label ?? (value.trim() ? value : null)
  }, [selected, value, triggerPlaceholderValues])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'h-10 w-full justify-between font-normal md:h-9',
            !displayLabel && 'text-muted-foreground',
            triggerClassName
          )}
        >
          <span className="truncate text-left">{displayLabel ?? placeholder}</span>
          <ChevronsUpDown data-icon="inline-end" className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className={cn(
          'w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0',
          contentClassName
        )}
        onWheel={(e) => e.stopPropagation()}
      >
        <Command
          className="rounded-lg"
          filter={(cmdValue, search, keywords) => {
            const extend = [cmdValue, ...(keywords ?? [])].join(' ').toLowerCase()
            if (!search.trim()) return 1
            return extend.includes(search.trim().toLowerCase()) ? 1 : 0
          }}
        >
          <CommandInput placeholder={commandInputPlaceholder ?? placeholder} />
          <CommandList className={listClassName}>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {showClearOption ? (
                <CommandItem
                  value="__clear__"
                  keywords={['선택', '안', '함', 'clear']}
                  onSelect={() => {
                    onChange('')
                    setOpen(false)
                  }}
                >
                  선택 안 함
                </CommandItem>
              ) : null}
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.value}
                  disabled={opt.disabled}
                  keywords={[opt.label, ...(opt.keywords ?? [])]}
                  onSelect={() => {
                    if (opt.disabled) return
                    onChange(opt.value)
                    setOpen(false)
                  }}
                >
                  <span className="line-clamp-3 text-left">{opt.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
