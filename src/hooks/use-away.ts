import { useSyncExternalStore } from "react"

import { setLive } from "@/lib/convex"

// Coming back reruns every open query, so a quick look at another tab shouldn't pause anything.
const hiddenMs = 60 * 1000
const idleMs = 10 * 60 * 1000
const activity = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const

let away = false
const listeners = new Set<() => void>()
const set = (next: boolean) => {
  if (next === away) return
  away = next
  setLive(!next)
  for (const listener of listeners) listener()
}

const listen = (changed: () => void) => {
  listeners.add(changed)
  return () => {
    listeners.delete(changed)
  }
}

const watch = (changed: () => void) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const seen = () => {
    clearTimeout(timer)
    const hidden = document.visibilityState === "hidden"
    if (!hidden) set(false)
    timer = setTimeout(() => set(true), hidden ? hiddenMs : idleMs)
  }
  for (const name of activity) window.addEventListener(name, seen, { passive: true })
  document.addEventListener("visibilitychange", seen)
  const stop = listen(changed)
  seen()
  return () => {
    clearTimeout(timer)
    for (const name of activity) window.removeEventListener(name, seen)
    document.removeEventListener("visibilitychange", seen)
    stop()
    set(false)
  }
}

const now = () => away
const onServer = () => false

/** Closes the Convex connection while the tab has been hidden for a minute or nobody has touched it
 * for ten, so nothing reruns for a screen no one is watching. Any input or showing the tab again
 * reconnects, and every query catches up. Returns whether it's paused. Mount it once, in a layout. */
export const usePauseWhenAway = () => useSyncExternalStore(watch, now, onServer)

/** Whether the layout has paused for an absent user. Always false outside that layout. */
export const useAway = () => useSyncExternalStore(listen, now, onServer)
