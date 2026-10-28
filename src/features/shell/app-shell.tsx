import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppSidebar } from "@/features/shell/app-sidebar"

export const AppShell = ({ children }: { children: React.ReactNode }) => (
  <TooltipProvider>
    <SidebarProvider>
      <AppSidebar variant="inset" />
      {/* Each page renders its own PageHeader, which holds the sidebar toggle. */}
      {/* min-w-0 keeps a wide board scrolling inside the page instead of widening it. */}
      <SidebarInset className="min-w-0">{children}</SidebarInset>
    </SidebarProvider>
  </TooltipProvider>
)
