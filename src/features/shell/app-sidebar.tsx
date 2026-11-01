import { Link, useRouterState } from "@tanstack/react-router"
import {
  Activity01Icon,
  FileEditIcon,
  Briefcase01Icon,
  Calendar03Icon,
  File01Icon,
  InboxIcon,
  JobSearchIcon,
  Layers01Icon,
  Mail01Icon,
  PencilEdit02Icon,
  RepeatIcon,
  Target02Icon,
  UserCircleIcon,
  UserMultiple02Icon,
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

type Item = { title: string; to: string; icon: typeof InboxIcon; badge?: number }

// The pages, grouped by what you do with them: the day's work on top, then finding
// roles, what runs for you, the tracker's own views, and what the app knows about you.
const groups: { label?: string; items: readonly Item[] }[] = [
  {
    items: [
      { title: "Applications", to: "/pipeline", icon: Briefcase01Icon },
      { title: "Email", to: "/email", icon: Mail01Icon },
      { title: "Calendar", to: "/calendar", icon: Calendar03Icon },
    ],
  },
  {
    label: "Find roles",
    items: [
      { title: "Jobs", to: "/jobs", icon: JobSearchIcon },
      { title: "Loops", to: "/loops", icon: RepeatIcon },
    ],
  },
  {
    label: "Done for you",
    items: [
      { title: "Workflows", to: "/workflows", icon: WorkflowSquare03Icon },
      { title: "Prefilled applications", to: "/prefilled", icon: FileEditIcon },
      { title: "Activity", to: "/activity", icon: Activity01Icon },
    ],
  },
  {
    label: "Tracker",
    items: [
      { title: "Goals", to: "/goals", icon: Target02Icon },
      { title: "Views", to: "/views", icon: Layers01Icon },
      { title: "Contacts", to: "/contacts", icon: UserMultiple02Icon },
    ],
  },
  {
    label: "You",
    items: [
      { title: "Preferences", to: "/preferences", icon: UserCircleIcon },
      { title: "Resume", to: "/resume", icon: File01Icon },
    ],
  },
]

const NavItems = ({ items }: { items: readonly Item[] }) => {
  const { setOpenMobile } = useSidebar()
  const path = useRouterState({ select: (s) => s.location.pathname })
  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.to}>
          <SidebarMenuButton
            // Loads each page's code up front, so the first click doesn't wait for it.
            render={<Link to={item.to} preload="viewport" />}
            isActive={path.startsWith(item.to)}
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
  // Updates carries its unread count, so it's built here.
  const inbox = { title: "Updates", to: "/inbox", icon: InboxIcon, badge: useUnreadCount() }
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="flex-row items-center justify-between">
        <span className="flex items-center gap-2 px-2 text-sm font-medium group-data-[collapsible=icon]:hidden">
          <img src="/logo.svg" alt="" width={20} height={20} />
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
        {groups.map(({ label, items }, i) => (
          <SidebarGroup key={label ?? "top"} className="group-data-[collapsible=icon]:px-0">
            {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
            <NavItems items={i === 0 ? [inbox, ...items] : items} />
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="group-data-[collapsible=icon]:px-0">
        <ThemeSwitch />
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
