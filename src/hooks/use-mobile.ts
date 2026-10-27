import { useSyncExternalStore } from "react"

const query = "(max-width: 767px)"

const subscribe = (onChange: () => void) => {
  const mql = window.matchMedia(query)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

export const useIsMobile = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  )
