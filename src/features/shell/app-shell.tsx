import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppSidebar } from "@/features/shell/app-sidebar"
import { PageBar } from "@/features/shell/page-header"

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  return (
    <TooltipProvider>
      {/* Collapsed, the icon column is as wide as one icon button; app-sidebar drops the side padding to match. */}
      <SidebarProvider style={{ "--sidebar-width-icon": "2rem" } as React.CSSProperties}>
        <AppSidebar variant="inset" />
        {/* The one frame every page sits in: its height, background, corners and top bar stay
          put between pages, and only the page below the bar changes. */}
        {/* min-w-0 keeps a wide board scrolling inside the page instead of widening it. */}
        <SidebarInset className="h-svh min-w-0 overflow-hidden md:h-[calc(100svh-1rem)]">
          <PageBar />
          {/* No fade between pages: switching should feel instant, not like a reload. */}
          {/* Scrolls for a page that doesn't scroll itself, like Views. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
