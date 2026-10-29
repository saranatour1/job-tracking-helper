// Registers `api.inbox.*` and `internal.inbox.*`. Definitions live in
// ./api/features/notifications; the feed itself is the notifications component.
import { notificationsApi } from "./api/features/notifications/public"

export const { inbox, unreadCount, setRead, settings, setOn, removeNotifications } =
  notificationsApi
