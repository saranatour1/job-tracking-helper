import { useAuthActions } from "@convex-dev/auth/react"
import { Link } from "@tanstack/react-router"
import { Briefcase01Icon, Logout01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

const nav = [{ title: "Applications", to: "/", icon: Briefcase01Icon }] as const

export const AppSidebar = (props: React.ComponentProps<typeof Sidebar>) => {
  const { signOut } = useAuthActions()
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {nav.map((item) => (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton asChild tooltip={item.title}>
                  <Link to={item.to}>
                    <HugeiconsIcon icon={item.icon} />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Sign out" onClick={() => void signOut()}>
              <HugeiconsIcon icon={Logout01Icon} />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
