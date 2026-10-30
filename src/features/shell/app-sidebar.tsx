import { Link, useRouterState } from "@tanstack/react-router"
import {
  Activity01Icon,
  Briefcase01Icon,
  Calendar03Icon,
  File01Icon,
  InboxIcon,
  JobSearchIcon,
  Layers01Icon,
  PencilEdit02Icon,
  RepeatIcon,
  Target02Icon,
  UserCircleIcon,
  WorkflowSquare03Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { NavUser } from "@/features/shell/nav-user"
import { ThemeSwitch } from "@/features/shell/theme"
import { useUnreadCount } from "@/features/inbox/inbox"
import { NewApplicationDialog } from "@/features/tracker/new-application"

const tracker = [
  { title: "Goals", to: "/goals", icon: Target02Icon },
  { title: "Views", to: "/views", icon: Layers01Icon },
] as const

type Item = { title: string; to: string; icon: typeof InboxIcon; badge?: number }

const NavItems = ({ items }: { items: readonly Item[] }) => {
  const { setOpenMobile } = useSidebar()
  const path = useRouterState({ select: (s) => s.location.pathname })
  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.to}>
          <SidebarMenuButton
            render={<Link to={item.to} />}
            isActive={item.to === "/" ? path === "/" : path.startsWith(item.to)}
            tooltip={item.title}
            onClick={() => setOpenMobile(false)}
          >
            <HugeiconsIcon icon={item.icon} />
            <span>{item.title}</span>
          </SidebarMenuButton>
          {item.badge ? <SidebarMenuBadge>{item.badge}</SidebarMenuBadge> : null}
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}

export const AppSidebar = (props: React.ComponentProps<typeof Sidebar>) => {
  const top = [
    { title: "Inbox", to: "/inbox", icon: InboxIcon, badge: useUnreadCount() },
    { title: "Activity", to: "/activity", icon: Activity01Icon },
    { title: "Applications", to: "/", icon: Briefcase01Icon },
    { title: "Calendar", to: "/calendar", icon: Calendar03Icon },
    { title: "Preferences", to: "/preferences", icon: UserCircleIcon },
    { title: "Resume", to: "/resume", icon: File01Icon },
    { title: "Jobs", to: "/jobs", icon: JobSearchIcon },
    { title: "Loops", to: "/loops", icon: RepeatIcon },
    { title: "Workflows", to: "/workflows", icon: WorkflowSquare03Icon },
  ]
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="flex-row items-center justify-between">
        <span className="flex items-center gap-2 px-2 text-sm font-medium group-data-[collapsible=icon]:hidden">
          <span className="bg-primary text-primary-foreground flex size-5 items-center justify-center rounded-md text-xs">
            J
          </span>
          Job search
        </span>
        <NewApplicationDialog
          trigger={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="New application"
              className="group-data-[collapsible=icon]:hidden"
            >
              <HugeiconsIcon icon={PencilEdit02Icon} />
            </Button>
          }
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="group-data-[collapsible=icon]:px-0">
          <NavItems items={top} />
        </SidebarGroup>
        <SidebarGroup className="group-data-[collapsible=icon]:px-0">
          <SidebarGroupLabel>Tracker</SidebarGroupLabel>
          <NavItems items={tracker} />
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="group-data-[collapsible=icon]:px-0">
        <ThemeSwitch />
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
