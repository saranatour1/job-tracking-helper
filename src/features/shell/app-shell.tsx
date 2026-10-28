import { useRouterState } from "@tanstack/react-router"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppSidebar } from "@/features/shell/app-sidebar"

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const path = useRouterState({ select: (s) => s.location.pathname })
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar variant="inset" />
        {/* Each page renders its own PageHeader, which holds the sidebar toggle. */}
        {/* min-w-0 keeps a wide board scrolling inside the page instead of widening it. */}
        <SidebarInset className="min-w-0">
          {/* Keyed by path so each new page fades in; search-param changes (views) don't remount. */}
          <div
            key={path}
            className="animate-in fade-in flex min-h-0 flex-1 flex-col duration-200 motion-reduce:animate-none"
          >
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
