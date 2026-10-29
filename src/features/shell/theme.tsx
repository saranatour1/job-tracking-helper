import { ComputerIcon, Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useSyncExternalStore } from "react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

const themes = [
  { value: "light", label: "Light", icon: Sun03Icon },
  { value: "dark", label: "Dark", icon: Moon02Icon },
  { value: "system", label: "System", icon: ComputerIcon },
] as const
type Theme = (typeof themes)[number]["value"]

// Runs in <head> before the page paints, so a dark theme never flashes light first.
// It sets `light` too, since the calendar (kloq) follows the OS when neither class is there.
export const themeScript = `try{var t=localStorage.getItem("theme")||"system",d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches),c=document.documentElement.classList;c.toggle("dark",d);c.toggle("light",!d)}catch(e){}`

const dark = () => matchMedia("(prefers-color-scheme: dark)")
const read = (): Theme => {
  try {
    const saved = localStorage.getItem("theme")
    return saved === "light" || saved === "dark" ? saved : "system"
  } catch {
    return "system"
  }
}
const apply = (theme: Theme) => {
  const isDark = theme === "dark" || (theme === "system" && dark().matches)
  document.documentElement.classList.toggle("dark", isDark)
  document.documentElement.classList.toggle("light", !isDark)
}

const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  // In System mode, follow the OS when it switches between light and dark.
  const onChange = () => read() === "system" && apply("system")
  dark().addEventListener("change", onChange)
  return () => {
    listeners.delete(listener)
    dark().removeEventListener("change", onChange)
  }
}
const setTheme = (theme: Theme) => {
  try {
    localStorage.setItem("theme", theme)
  } catch {
    // Storage blocked (private mode): the choice lasts until reload.
  }
  apply(theme)
  for (const listener of listeners) listener()
}

export const ThemeSwitch = () => {
  const theme = useSyncExternalStore(subscribe, read, (): Theme => "system")
  return (
    <ToggleGroup
      size="sm"
      aria-label="Theme"
      className="w-full *:flex-1 group-data-[collapsible=icon]:hidden"
      value={[theme]}
      onValueChange={(v) => v[0] && setTheme(v[0] as Theme)}
    >
      {themes.map((t) => (
        <ToggleGroupItem key={t.value} value={t.value} aria-label={t.label} title={t.label}>
          <HugeiconsIcon icon={t.icon} />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
