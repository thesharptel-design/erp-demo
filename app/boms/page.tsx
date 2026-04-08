import { supabase } from '@/lib/supabase'

type BomHeaderRow = {
  id: number
  bom_code: string
  version_no: string
  status: string
  remarks: string | null
  parent_item_id: number
}

type ItemRow = {
  id: number
  item_code: string
  item_name: string
}

type BomItemRow = {
  id: number
  bom_id: number
  line_no: number
  child_item_id: number
  qty: number
  remarks: string | null
}

async function getBomPageData() {
  const [
    { data: bomHeaders, error: bomHeadersError },
    { data: items, error: itemsError },
    { data: bomItems, error: bomItemsError },
  ] = await Promise.all([
    supabase.from('boms').select('id, bom_code, version_no, status, remarks, parent_item_id').order('id'),
    supabase.from('items').select('id, item_code, item_name').order('id'),
    supabase.from('bom_items').select('id, bom_id, line_no, child_item_id, qty, remarks').order('bom_id').order('line_no'),
  ])

  if (bomHeadersError) console.error('boms error:', bomHeadersError.message)
  if (itemsError) console.error('items error:', itemsError.message)
  if (bomItemsError) console.error('bom_items error:', bomItemsError.message)

  return {
    bomHeaders: (bomHeaders as BomHeaderRow[]) ?? [],
    items: (items as ItemRow[]) ?? [],
    bomItems: (bomItems as BomItemRow[]) ?? [],
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'active':
      return '사용중'
    case 'inactive':
      return '미사용'
    default:
      return status
  }
}

function getStatusStyle(status: string) {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-700'
    case 'inactive':
      return 'bg-gray-100 text-gray-700'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

export default async function BomsPage() {
  const { bomHeaders, items, bomItems } = await getBomPageData()

  const itemMap = new Map(items.map((item) => [item.id, item]))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">BOM 조회</h1>
          <p className="mt-1 text-gray-600">완제품과 자재 구성 정보를 조회합니다.</p>
        </div>
        <button className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white">
          BOM 등록
        </button>
      </div>

      {bomHeaders.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center text-gray-400 shadow">
          BOM 데이터가 없습니다.
        </div>
      ) : (
        <div className="space-y-6">
          {bomHeaders.map((bom) => {
            const parentItem = itemMap.get(bom.parent_item_id)
            const children = bomItems.filter((row) => row.bom_id === bom.id)

            return (
              <div key={bom.id} className="overflow-hidden rounded-2xl bg-white shadow">
                <div className="border-b border-gray-100 px-6 py-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold">
                        {parentItem?.item_name ?? '-'}
                      </h2>
                      <p className="mt-1 text-sm text-gray-500">
                        품목코드: {parentItem?.item_code ?? '-'} / BOM 코드: {bom.bom_code}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-500">버전 {bom.version_no}</span>
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getStatusStyle(
                          bom.status
                        )}`}
                      >
                        {getStatusLabel(bom.status)}
                      </span>
                    </div>
                  </div>

                  {bom.remarks && (
                    <p className="mt-3 text-sm text-gray-600">{bom.remarks}</p>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left text-gray-500">
                      <tr>
                        <th className="px-4 py-3">순번</th>
                        <th className="px-4 py-3">자재코드</th>
                        <th className="px-4 py-3">자재명</th>
                        <th className="px-4 py-3">소요량</th>
                        <th className="px-4 py-3">비고</th>
                      </tr>
                    </thead>
                    <tbody>
                      {children.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                            자재 구성 데이터가 없습니다.
                          </td>
                        </tr>
                      ) : (
                        children.map((child) => {
                          const childItem = itemMap.get(child.child_item_id)

                          return (
                            <tr key={child.id} className="border-t border-gray-100">
                              <td className="px-4 py-3">{child.line_no}</td>
                              <td className="px-4 py-3">{childItem?.item_code ?? '-'}</td>
                              <td className="px-4 py-3 font-medium">
                                {childItem?.item_name ?? '-'}
                              </td>
                              <td className="px-4 py-3">{child.qty}</td>
                              <td className="px-4 py-3">{child.remarks ?? '-'}</td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}