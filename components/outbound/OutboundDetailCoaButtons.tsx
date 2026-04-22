'use client'

import { supabase } from '@/lib/supabase'

export type OutboundCoaFileRow = {
  id: number
  item_id: number
  version_no: number
  file_name: string
  storage_path: string
}

export default function OutboundDetailCoaButtons({ files }: { files: OutboundCoaFileRow[] }) {
  if (files.length === 0) return null
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {files.map((file) => (
        <button
          key={file.id}
          type="button"
          onClick={async () => {
            const { data, error } = await supabase.storage.from('coa-files').createSignedUrl(file.storage_path, 60)
            if (error || !data?.signedUrl) {
              alert('CoA 다운로드 링크 생성 실패')
              return
            }
            window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
          }}
          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700 hover:bg-blue-100"
        >
          CoA v{file.version_no} - {file.file_name}
        </button>
      ))}
    </div>
  )
}
