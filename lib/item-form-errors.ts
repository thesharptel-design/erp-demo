type SupabaseInsertError = {
  code?: string
  message: string
}

export function getItemErrorMessage(error: SupabaseInsertError) {
  const message = error.message.toLowerCase()

  if (error.code === '23505') {
    if (message.includes('item_code')) {
      return '품목 코드가 중복되었습니다. 다른 품목 코드를 입력하십시오.'
    }
    if (message.includes('item_name')) {
      return '이미 등록된 품목명입니다. 다른 이름을 입력하십시오.'
    }
    return '중복된 값이 있습니다. 입력값을 다시 확인하십시오.'
  }

  if (error.code === '23502') {
    if (message.includes('item_code')) return '품목 코드를 입력하십시오.'
    if (message.includes('item_name')) return '품목명을 입력하십시오.'
    if (message.includes('item_type')) return '품목 유형을 선택하십시오.'
    return '필수 입력값이 누락되었습니다. 입력 내용을 확인하십시오.'
  }

  if (error.code === '23514') return '입력값 형식이 올바르지 않습니다. 입력 내용을 다시 확인하십시오.'
  if (message.includes('row-level security') || message.includes('permission denied')) {
    return '저장 권한이 없습니다. 관리자에게 문의하십시오.'
  }
  if (message.includes('network') || message.includes('fetch')) {
    return '네트워크 오류가 발생했습니다. 인터넷 연결 상태를 확인한 후 다시 시도하십시오.'
  }

  return '품목 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
}
