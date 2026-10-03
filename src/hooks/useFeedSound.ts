import { useSyncExternalStore } from 'react'

/**
 * One sound preference + one "currently playing post" for everything that auto-plays in the feed
 * (post videos and post music). Mute once and every other post stays muted; unmute and they all follow.
 */
const KEY = 'smg.feed.sound'

function read(): boolean {
  try {
    return sessionStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

let soundOn = read()
const listeners = new Set<() => void>()

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function getFeedSound() {
  return soundOn
}

export function setFeedSound(on: boolean) {
  soundOn = on
  try {
    sessionStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    /* private mode: just won't persist across reloads */
  }
  listeners.forEach((l) => l())
}

export function useFeedSound(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, getFeedSound, getFeedSound)
  return [on, setFeedSound]
}

// ---- feed media is suspended while any dialog/overlay is open (story viewer, post popup, lightbox...) ----
let suspended = false
const suspendListeners = new Set<(s: boolean) => void>()

export const isFeedSuspended = () => suspended

export function onFeedSuspendChange(cb: (suspended: boolean) => void) {
  suspendListeners.add(cb)
  return () => {
    suspendListeners.delete(cb)
  }
}

if (typeof document !== 'undefined') {
  // Overlays are portalled straight into <body> with role="dialog" / "alertdialog".
  const check = () => {
    const next = document.querySelector('body > [role="dialog"], body > [role="alertdialog"]') !== null
    if (next === suspended) return
    suspended = next
    if (next) registry.forEach((_, el) => el.pause())
    suspendListeners.forEach((l) => l(next))
  }
  new MutationObserver(check).observe(document.body, { childList: true })
}

// ---- only one post plays at a time ----
const registry = new Map<HTMLMediaElement, string>()

/** Registers an element under a post key; returns an unregister function. */
export function registerMedia(group: string, el: HTMLMediaElement) {
  registry.set(el, group)
  return () => {
    registry.delete(el)
  }
}

/** Call right before playing: pauses everything that belongs to a different post. */
export function claimPlayback(group: string) {
  registry.forEach((g, el) => {
    if (g !== group) el.pause()
  })
}
