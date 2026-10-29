import { useCallback, useRef } from "react"

import { useSidebar } from "@/components/ui/sidebar"

// One sidebar at a time: give this to a right-hand panel's `ref`. While the panel is on
// screen the app sidebar stays collapsed, and it comes back when the panel closes if
// it was open before. Phones show the app sidebar as a sheet, so nothing changes there.
export const useCollapsesSidebar = () => {
  const sidebar = useSidebar()
  // Read at mount, not when this was created, so the callback can stay the same.
  const latest = useRef(sidebar)
  latest.current = sidebar
  return useCallback((panel: HTMLElement | null) => {
    if (!panel || latest.current.isMobile) return
    const wasOpen = latest.current.open
    latest.current.setOpen(false)
    return () => {
      if (wasOpen) latest.current.setOpen(true)
    }
  }, [])
}
