/** 브라우저에 저장되는 쪽지/알림 도착 시 소리·토스트(상단 알림) 여부. */

export type InboxArrivalScope = 'message' | 'notification'

const PREFIX = 'erp-demo:inbox-arrival'

function soundKey(scope: InboxArrivalScope) {
  return `${PREFIX}:${scope}:sound`
}

function toastKey(scope: InboxArrivalScope) {
  return `${PREFIX}:${scope}:toast`
}

const CHANGED = 'erp-demo-inbox-arrival-prefs'

function getLs(): Storage | null {
  if (typeof globalThis === 'undefined') return null
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage
    return ls && typeof ls.getItem === 'function' ? ls : null
  } catch {
    return null
  }
}

function dispatch() {
  try {
    const g = globalThis as { dispatchEvent?: (e: Event) => boolean }
    g.dispatchEvent?.(new Event(CHANGED))
  } catch {
    /* ignore */
  }
}

/** 기본: 소리·토스트 모두 켜짐. `localStorage` 값이 `'0'`이면 꺼짐. */
export function getArrivalSoundEnabled(scope: InboxArrivalScope): boolean {
  const ls = getLs()
  if (!ls) return true
  return ls.getItem(soundKey(scope)) !== '0'
}

export function getArrivalToastEnabled(scope: InboxArrivalScope): boolean {
  const ls = getLs()
  if (!ls) return true
  return ls.getItem(toastKey(scope)) !== '0'
}

export function setArrivalSoundEnabled(scope: InboxArrivalScope, enabled: boolean) {
  const ls = getLs()
  if (!ls) return
  ls.setItem(soundKey(scope), enabled ? '1' : '0')
  dispatch()
}

export function setArrivalToastEnabled(scope: InboxArrivalScope, enabled: boolean) {
  const ls = getLs()
  if (!ls) return
  ls.setItem(toastKey(scope), enabled ? '1' : '0')
  dispatch()
}

export function subscribeArrivalAlarmPrefs(cb: () => void) {
  const g = globalThis as { addEventListener?: (t: string, l: () => void) => void; removeEventListener?: (t: string, l: () => void) => void }
  const add = g.addEventListener
  const remove = g.removeEventListener
  if (typeof add !== 'function' || typeof remove !== 'function') return () => {}
  const run = () => cb()
  add.call(g, CHANGED, run)
  add.call(g, 'storage', run)
  return () => {
    remove.call(g, CHANGED, run)
    remove.call(g, 'storage', run)
  }
}
