/**
 * Supabase/Postgres 임시저장(동기화) 실패 시 사용자용 원인 문구로 정리합니다.
 * (로컬 브라우저 저장 여부 안내는 draft-form-feedback에서 합성합니다.)
 */

function rawMessage(err: unknown): string {
  if (err == null) return ''
  if (typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return String((err as { message: string }).message)
  }
  if (err instanceof Error) return err.message
  return String(err)
}

function postgrestCode(err: unknown): string | null {
  if (err && typeof err === 'object' && 'code' in err) {
    const c = (err as { code?: unknown }).code
    return typeof c === 'string' ? c : null
  }
  return null
}

/** 서버만 실패했을 때 항상 덧붙이는 안내(배너·토스트에서 공통 사용) */
export const DRAFT_LOCAL_BROWSER_PERSISTENCE_HINT =
  '지금 사용 중인 PC의 브라우저에는 작성 내용이 저장되어 있어, 같은 브라우저로 이 페이지를 다시 열면 이어서 수정할 수 있습니다. 다른 PC나 다른 브라우저·시크릿 창에서는 보이지 않을 수 있습니다.'

/**
 * 임시저장 API(sync) 실패 원인을 한국어로 짧게 설명합니다.
 */
export function formatDraftServerSaveFailureReason(err: unknown): string {
  const msg = rawMessage(err)
  const lower = msg.toLowerCase()
  const code = postgrestCode(err)

  if (msg.includes('결재권이 없는 사용자')) {
    return '기안자 또는 결재선에 지정된 사용자 중 결재권이 없는 분이 있습니다. 결재선을 수정한 뒤 다시 저장해 주세요.'
  }

  if (
    lower.includes('jwt') ||
    lower.includes('session') ||
    lower.includes('invalid refresh token') ||
    msg.includes('인증') ||
    code === 'PGRST301'
  ) {
    return '로그인 세션이 만료되었거나 인증에 실패했습니다. 다시 로그인한 뒤 저장해 주세요.'
  }

  if (
    lower.includes('new row violates row-level security') ||
    lower.includes('row-level security') ||
    lower.includes('permission denied') ||
    code === '42501'
  ) {
    return '서버 권한 정책으로 저장할 수 없습니다. 로그인 계정·권한을 확인하거나 관리자에게 문의해 주세요.'
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('load failed') ||
    lower.includes('econnrefused') ||
    msg === 'TypeError: Failed to fetch'
  ) {
    return '네트워크 오류로 서버에 연결하지 못했습니다. 연결을 확인한 뒤 잠시 후 다시 시도해 주세요.'
  }

  if (code === '23505' || lower.includes('duplicate key')) {
    return '서버에 동일한 데이터가 이미 있어 저장할 수 없습니다. 잠시 후 다시 시도하거나 관리자에게 문의해 주세요.'
  }

  if (msg.includes('임시저장 문서 생성 실패') || msg.includes('임시 문서를 불러올 수 없습니다')) {
    return '서버에 임시 문서를 만들거나 갱신하지 못했습니다. 잠시 후 다시 시도해 주세요.'
  }

  if (msg.includes('출고요청 임시 본문 생성 실패')) {
    return '서버에 출고 요청 초안을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.'
  }

  if (msg.trim().length === 0) {
    return '서버에 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'
  }

  // Postgres RAISE 등 긴 영문 메시지는 한 줄만 사용
  const oneLine = msg.split('\n')[0]?.trim() ?? msg
  if (oneLine.length > 180) {
    return `${oneLine.slice(0, 177)}…`
  }
  return oneLine
}
