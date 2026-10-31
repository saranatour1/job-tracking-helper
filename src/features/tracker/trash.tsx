import { api } from "@convex/_generated/api"
import type { Doc } from "@convex/_generated/dataModel"
import { ArrowTurnBackwardIcon, Delete02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"
import { useMutation } from "convex/react"
import { usePaginatedQuery, useQuery } from "convex-helpers/react/cache/hooks"
import { startTransition, useActionState } from "react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { messageOf } from "@/features/account/settings"

import { StatusIcon } from "./icons"
import { useSource } from "./source"

const day = 24 * 60 * 60 * 1000
const pageSize = 50

// The Trash: applications that are out of everything, until they're restored or deleted
// for good, by hand or after the days set under Account.
export const TrashList = () => {
  const source = useSource()
  const {
    results: trashed,
    status,
    loadMore,
  } = usePaginatedQuery(api.applications.trashed, {}, { initialNumItems: pageSize })
  const settings = useQuery(api.applications.trashSettings)
  const restore = useMutation(api.applications.restore)
  const deleteForever = useMutation(api.applications.deleteForever)
  const empty = useMutation(api.applications.emptyTrash)
  const [error, act] = useActionState(
    async (
      _: string | undefined,
      action: { restore: Doc<"applications"> } | { delete: Doc<"applications"> } | "empty"
    ) => {
      try {
        if (action === "empty") {
          if (!window.confirm("Delete everything in the Trash for good? This can't be undone."))
            return undefined
          await empty({})
        } else if ("restore" in action) await restore({ id: action.restore._id })
        else {
          const a = action.delete
          if (!window.confirm(`Delete ${a.role} at ${a.company} for good? This can't be undone.`))
            return undefined
          await deleteForever({ id: a._id })
        }
        return undefined
      } catch (cause) {
        return messageOf(cause)
      }
    },
    undefined
  )
  if (!source.real)
    return <p className="text-muted-foreground m-auto text-sm">Sign in to keep a Trash.</p>
  const keep = settings?.trashDays ?? 90
  const now = Date.now()
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-[13px]">
            {keep
              ? `Applications here are deleted for good after ${keep} days.`
              : "Applications stay here until you delete them."}{" "}
            Archived ones move here after {settings?.archiveDays ?? 30} days.{" "}
            <Link to="/account" className="text-foreground underline underline-offset-2">
              Change under Account
            </Link>
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={!trashed.length}
            onClick={() => startTransition(() => act("empty"))}
          >
            Empty the Trash
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-destructive text-xs">
            {error}
          </p>
        )}
        {status === "Exhausted" && trashed.length === 0 && (
          <p className="text-muted-foreground py-8 text-center text-sm">The Trash is empty.</p>
        )}
        <div className="bg-card divide-y rounded-lg border empty:hidden">
          {trashed.map((a) => {
            const left = keep
              ? Math.max(0, Math.ceil((a.trashedAt! + keep * day - now) / day))
              : null
            return (
              <div key={a._id} className="flex items-center gap-3 px-3 py-2.5 text-[13px]">
                <StatusIcon status={a.status} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{a.role}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {a.company}
                    {left !== null &&
                      ` · deleted for good in ${left} ${left === 1 ? "day" : "days"}`}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => startTransition(() => act({ restore: a }))}
                >
                  <HugeiconsIcon icon={ArrowTurnBackwardIcon} />
                  Restore
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => startTransition(() => act({ delete: a }))}
                >
                  <HugeiconsIcon icon={Delete02Icon} />
                  Delete forever
                </Button>
              </div>
            )
          })}
        </div>
        {status === "CanLoadMore" && (
          <Button
            size="sm"
            variant="ghost"
            className="self-center"
            onClick={() => loadMore(pageSize)}
          >
            Load more
          </Button>
        )}
      </div>
    </ScrollArea>
  )
}
