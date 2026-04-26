import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getArrivalSoundEnabled,
  getArrivalToastEnabled,
  setArrivalSoundEnabled,
  setArrivalToastEnabled,
} from '@/lib/inbox-arrival-alarm-prefs'

function installMemoryLocalStorage() {
  const store: Record<string, string> = {}
  const mock: Storage = {
    get length() {
      return Object.keys(store).length
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k]
    },
    getItem: (k: string) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v
    },
    removeItem: (k: string) => {
      delete store[k]
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
  }
  vi.stubGlobal('localStorage', mock)
  return store
}

describe('inbox-arrival-alarm-prefs', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults sound and toast to enabled', () => {
    installMemoryLocalStorage()
    expect(getArrivalSoundEnabled('message')).toBe(true)
    expect(getArrivalToastEnabled('notification')).toBe(true)
  })

  it('persists message sound off', () => {
    installMemoryLocalStorage()
    setArrivalSoundEnabled('message', false)
    expect(getArrivalSoundEnabled('message')).toBe(false)
    setArrivalSoundEnabled('message', true)
    expect(getArrivalSoundEnabled('message')).toBe(true)
  })

  it('keeps message and notification scopes separate', () => {
    installMemoryLocalStorage()
    setArrivalToastEnabled('message', false)
    expect(getArrivalToastEnabled('message')).toBe(false)
    expect(getArrivalToastEnabled('notification')).toBe(true)
  })
})
