'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseItemProcessCategoriesJson, saveItemProcessCategories } from '@/lib/item-process-config'
import { supabase } from '@/lib/supabase'

export type CatRow = { id: string; key: string; linesText: string }

function toRows(c: Record<string, readonly string[] | string[]>): CatRow[] {
  return Object.entries(c).map(([key, arr]) => ({
    id: `${key}__${Math.random().toString(36).slice(2, 9)}`,
    key,
    linesText: [...arr].join('\n'),
  }))
}

function fromRows(rows: CatRow[]): Record<string, string[]> {
  const o: Record<string, string[]> = {}
  const seen = new Set<string>()
  for (const r of rows) {
    const k = r.key.trim()
    if (!k) continue
    if (seen.has(k)) {
      throw new Error(`중복된 공정명: ${k}`)
    }
    seen.add(k)
    o[k] = r.linesText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
  }
  return o
}

type Props = {
  backHref: string
  backLabel: string
}

export function ItemProcessConfigEditor({ backHref, backLabel }: Props) {
  const [userId, setUserId] = useState<string | null>(null)
  const [rows, setRows] = useState<CatRow[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    setUserId(user?.id ?? null)

    const { data, error } = await supabase.from('item_process_config').select('categories').eq('id', 1).maybeSingle()
    if (error) {
      toast.error('설정을 불러오지 못했습니다.', { description: error.message })
      setRows([])
      setLoading(false)
      return
    }
    const parsed = parseItemProcessCategoriesJson(data?.categories ?? {})
    setRows(toRows(parsed))
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const addRow = () => {
    setRows((prev) => [...prev, { id: `new__${Math.random().toString(36).slice(2, 9)}`, key: '', linesText: '' }])
  }

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id))
  }

  const save = async () => {
    setSaving(true)
    try {
      const next = fromRows(rows)
      const { errorMessage } = await saveItemProcessCategories(supabase, next, userId)
      if (errorMessage) {
        toast.error('저장 실패', { description: errorMessage })
        return
      }
      toast.success('공정 상세 설정을 저장했습니다. 품목 목록에 즉시 반영됩니다.')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-0.5 h-8 px-0 text-xs font-bold text-muted-foreground">
            <Link href={backHref}>{backLabel}</Link>
          </Button>
          <h1 className="text-xl font-black tracking-tight">공정 상세 설정</h1>
          <p className="mt-0.5 text-xs font-medium text-muted-foreground">
            공정명·공정 체크 항목을 추가·수정·삭제합니다. 저장 시 모든 품목 화면에 반영됩니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={addRow}>
            공정명 추가
          </Button>
          <Button type="button" size="sm" className="h-8 text-xs" disabled={saving} onClick={() => void save()}>
            {saving ? '저장 중…' : '저장'}
          </Button>
        </div>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm">공정명 · 체크리스트</CardTitle>
          <CardDescription className="text-xs">공정명별로 줄바꿈으로 체크 항목을 입력합니다.</CardDescription>
        </CardHeader>
        <CardContent className="max-h-[min(70vh,40rem)] space-y-3 overflow-y-auto py-3 pr-1">
          {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">「공정명 추가」로 항목을 만드세요.</p>
          ) : (
            rows.map((row, idx) => (
              <div key={row.id} className="rounded-lg border border-border bg-muted/15 p-3">
                <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground">공정명 {idx + 1}</Label>
                    <Input
                      value={row.key}
                      onChange={(e) => {
                        const v = e.target.value
                        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, key: v } : r)))
                      }}
                      placeholder="예: 정제/여과"
                      className="h-9 text-sm"
                    />
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 text-xs text-red-600" onClick={() => removeRow(row.id)}>
                    삭제
                  </Button>
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground">세부 체크 (한 줄에 하나)</Label>
                  <textarea
                    value={row.linesText}
                    onChange={(e) => {
                      const v = e.target.value
                      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, linesText: v } : r)))
                    }}
                    rows={4}
                    className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                    placeholder={'여과 압력·유량 기록\n세척·농축 단계 조성 확인'}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
