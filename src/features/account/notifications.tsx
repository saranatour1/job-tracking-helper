import { api } from "@convex/_generated/api"
import { type NotificationKind, notificationKinds } from "@convex/api/features/notifications/kinds"
import { useMutation, useQuery } from "convex/react"

import { Switch } from "@/components/ui/switch"
import { Row, Section } from "@/features/account/settings"

// Which kinds of notifications reach the Inbox. A kind that's off isn't recorded at all.
export const NotificationsSection = () => {
  const settings = useQuery(api.inbox.settings)
  const setOn = useMutation(api.inbox.setOn)
  if (!settings) return null
  return (
    <Section title="Notifications">
      {settings.map(({ kind, on }) => {
        const { label, description } = notificationKinds[kind as NotificationKind]
        return (
          <Row key={kind} label={label} htmlFor={`notify-${kind}`} description={description}>
            <Switch
              id={`notify-${kind}`}
              checked={on}
              onCheckedChange={(value) => void setOn({ kind: kind as NotificationKind, on: value })}
            />
          </Row>
        )
      })}
    </Section>
  )
}
