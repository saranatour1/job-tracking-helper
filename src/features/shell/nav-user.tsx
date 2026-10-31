import { useAuthActions } from "@convex-dev/auth/react"
import { api } from "@/lib/api"
import { Logout01Icon, UnfoldMoreIcon, UserIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"
import type { FunctionReturnType } from "convex/server"
import { useQuery } from "convex-helpers/react/cache/hooks"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Menu,
  MenuItem,
  MenuLinkItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

type Me = FunctionReturnType<typeof api.users.me>

const Identity = ({ me }: { me: Me }) => {
  const title = me.name || me.userName || "Guest"
  const subtitle = me.email || (me.name && me.userName ? `@${me.userName}` : "")
  const initials = title
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("")
  return (
    <>
      <Avatar className="rounded-lg">
        {me.imageUrl && <AvatarImage src={me.imageUrl} alt="" />}
        <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{title}</span>
        {subtitle && <span className="text-muted-foreground truncate text-xs">{subtitle}</span>}
      </div>
    </>
  )
}

export const NavUser = () => {
  const me = useQuery(api.users.me)
  const { signOut } = useAuthActions()
  const { isMobile, setOpenMobile } = useSidebar()
  if (!me) return null

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Menu>
          <MenuTrigger
            render={<SidebarMenuButton size="lg" aria-label="Account menu" />}
            className="data-popup-open:bg-sidebar-accent"
          >
            <Identity me={me} />
            <HugeiconsIcon icon={UnfoldMoreIcon} className="ml-auto" />
          </MenuTrigger>
          <MenuPopup
            side={isMobile ? "top" : "right"}
            align="end"
            // coss compiles its min-width rule to :not(:is()), which beats min-w-*; set width instead.
            className="w-[max(var(--anchor-width),14rem)]"
          >
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Identity me={me} />
            </div>
            <MenuSeparator />
            <MenuLinkItem render={<Link to="/account" />} onClick={() => setOpenMobile(false)}>
              <HugeiconsIcon icon={UserIcon} />
              Account
            </MenuLinkItem>
            <MenuSeparator />
            <MenuItem onClick={() => void signOut()}>
              <HugeiconsIcon icon={Logout01Icon} />
              Sign out
            </MenuItem>
          </MenuPopup>
        </Menu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
