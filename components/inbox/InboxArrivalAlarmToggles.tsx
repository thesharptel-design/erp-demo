'use client'

import { useCallback, useSyncExternalStore, type ReactNode } from 'react'
import { Bell, PanelTop } from 'lucide-react'
import {
  getArrivalSoundEnabled,
  getArrivalToastEnabled,
  setArrivalSoundEnabled,
  setArrivalToastEnabled,
  subscribeArrivalAlarmPrefs,
  type InboxArrivalScope,
} from '@/lib/inbox-arrival-alarm-prefs'

function useArrivalPrefs(scope: InboxArrivalScope) {
  const subscribe = useCallback((cb: () => void) => subscribeArrivalAlarmPrefs(cb), [])
  const soundOn = useSyncExternalStore(
    subscribe,
    () => getArrivalSoundEnabled(scope),
    () => true
  )
  const toastOn = useSyncExternalStore(
    subscribe,
    () => getArrivalToastEnabled(scope),
    () => true
  )
  return { soundOn, toastOn }
}

function SlashedIcon({ children, off }: { children: ReactNode; off: boolean }) {
  return (
    <span className={`relative inline-flex h-7 w-7 items-center justify-center ${off ? 'text-gray-400' : 'text-gray-800'}`}>
      {children}
      {off ? (
        <span
          className="pointer-events-none absolute left-0.5 right-0.5 top-1/2 h-[2px] -translate-y-1/2 rotate-[-42deg] rounded-full bg-rose-600"
          aria-hidden
        />
      ) : null}
    </span>
  )
}

type Props = { scope: InboxArrivalScope }

/** 제목 줄 우측: 소리 알림 / 상단 팝업(토스트) 각각 토글 */
export function InboxArrivalAlarmToggles({ scope }: Props) {
  const { soundOn, toastOn } = useArrivalPrefs(scope)

  return (
    <div className="flex shrink-0 items-center gap-0.5 sm:gap-1" role="group" aria-label="도착 알림 설정">
      <button
        type="button"
        onClick={() => setArrivalSoundEnabled(scope, !soundOn)}
        title={soundOn ? '소리 알림 끄기' : '소리 알림 켜기'}
        aria-pressed={soundOn}
        className="rounded-lg border-2 border-transparent p-1 text-gray-800 hover:border-gray-300 hover:bg-gray-100 active:bg-gray-200"
      >
        <SlashedIcon off={!soundOn}>
          <Bell className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </SlashedIcon>
        <span className="sr-only">{soundOn ? '소리 알림 끄기' : '소리 알림 켜기'}</span>
      </button>
      <button
        type="button"
        onClick={() => setArrivalToastEnabled(scope, !toastOn)}
        title={toastOn ? '팝업 알림 끄기' : '팝업 알림 켜기'}
        aria-pressed={toastOn}
        className="rounded-lg border-2 border-transparent p-1 text-gray-800 hover:border-gray-300 hover:bg-gray-100 active:bg-gray-200"
      >
        <SlashedIcon off={!toastOn}>
          <PanelTop className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </SlashedIcon>
        <span className="sr-only">{toastOn ? '팝업 알림 끄기' : '팝업 알림 켜기'}</span>
      </button>
    </div>
  )
}
