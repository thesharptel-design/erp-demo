import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      error:
        '이전 출고요청 상신 API는 결재라인 v2와 호환되지 않습니다. /outbound-requests/new 화면의 상신 흐름을 사용하세요.',
    },
    { status: 410 }
  )
}
