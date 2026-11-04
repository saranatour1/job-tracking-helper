import { api } from "@/lib/api"
import {
  changeOf,
  comparableFrom,
  comparedWeeks,
  type Dimension,
  weekMs,
  weekOf,
  weeksShown,
} from "@convex/features/jobs/dimensions"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { useQuery } from "convex-helpers/react/cache/hooks"

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { PageIntro, pageBody, RowSkeletons, Tile } from "@/features/shell/page-body"
import { PageHeader } from "@/features/shell/page-header"
import { useAccess } from "@/hooks/use-access"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

const labels: Record<Dimension, string> = {
  country: "Country",
  place: "Location",
  title: "Job title",
}

const dayOf = (week: number) =>
  new Date(week).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" })

// One row's weeks on its own scale, since it shows the shape and the numbers beside it the size.
// Last full week stands out; this week is faint, being only partway through.
const Weeks = ({ label, weeks }: { label: string; weeks: { week: number; roles: number }[] }) => {
  const most = Math.max(1, ...weeks.map((w) => w.roles))
  return (
    <div
      role="img"
      aria-label={`${label}: ${weeks.map((w) => `${dayOf(w.week)} ${w.roles}`).join(", ")}`}
      className="flex h-8 w-24 items-end gap-0.5 sm:w-40"
    >
      {weeks.map(({ week, roles }, i) => (
        <div
          key={week}
          title={`Week of ${dayOf(week)}: ${roles.toLocaleString("en")} ${roles === 1 ? "role" : "roles"}${i === weeks.length - 1 ? " so far" : ""}`}
          className="flex h-full min-w-0 flex-1 items-end"
        >
          <div
            className={cn(
              "min-h-px w-full rounded-t-[2px]",
              i === weeks.length - 2
                ? "bg-foreground"
                : i === weeks.length - 1
                  ? "bg-foreground/30"
                  : "bg-muted-foreground/40"
            )}
            style={{ height: `${(roles / most) * 100}%` }}
          />
        </div>
      ))}
    </div>
  )
}

const endingsShown = 6

// The whole catalog at a glance: how its roles tie to a company, and the endings of their domains.
const Catalog = () => {
  const stats = useQuery(api.jobs.stats)
  if (!stats) return null
  const { summary } = stats
  const parts = [
    { key: "own", label: "Own site", bar: "bg-success", text: "text-success-foreground" },
    {
      key: "name",
      label: "Name only",
      bar: "bg-muted-foreground/50",
      text: "text-muted-foreground",
    },
    { key: "unverified", label: "Unverified", bar: "bg-warning", text: "text-warning-foreground" },
  ] as const
  const shown = summary.endings.slice(0, endingsShown)
  const other = summary.endings.slice(endingsShown).reduce((n, e) => n + e.jobs, 0)
  return (
    <div className="grid gap-3 md:grid-cols-[5fr_4fr]">
      <Tile title="How roles tie to a company" className="gap-3">
        <div aria-hidden className="flex h-2 gap-0.5 px-1">
          {parts.map((p) => (
            <div
              key={p.key}
              className={cn("rounded-[2px]", p.bar)}
              style={{ flexGrow: summary[p.key] }}
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 px-1">
          {parts.map((p) => (
            <div key={p.key} className="flex flex-col gap-0.5">
              <span className="font-heading text-xl font-semibold tabular-nums">
                {summary[p.key].toLocaleString("en")}
              </span>
              <span className={cn("text-xs", p.text)}>{p.label}</span>
            </div>
          ))}
        </div>
      </Tile>
      <Tile title={`Domain ending, across ${summary.domains} domains`} className="gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1 text-[13px]">
          {shown.map((e) => (
            <span key={e.ending}>
              {e.ending}{" "}
              <span className="text-muted-foreground tabular-nums">
                {e.jobs.toLocaleString("en")}
              </span>
            </span>
          ))}
          {other > 0 && (
            <span className="text-muted-foreground tabular-nums">
              Other {other.toLocaleString("en")}
            </span>
          )}
        </div>
      </Tile>
    </div>
  )
}

// New roles a week for each country, place or kind of job, from what's rolled up in `jobTrends`.
export const Trends = () => {
  const { member: signedIn } = useAccess()
  const { by = "country" } = useSearch({ from: "/_app/jobs/trends" })
  const navigate = useNavigate({ from: "/jobs/trends" })
  const week = weekOf(Date.now())
  const comparable = week >= comparableFrom
  const rows = useQuery(api.jobs.trends, { dimension: by, week })
  const allWeeks = Array.from(
    { length: weeksShown },
    (_, i) => week - (weeksShown - 1 - i) * weekMs
  )
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {signedIn && <PageHeader crumbs={[{ label: "Jobs", to: "/jobs" }, { label: "Trends" }]} />}
      <ScrollArea className="min-h-0 flex-1">
        <div className={pageBody}>
          <PageIntro
            title="Job trends"
            description="New roles posted each week, across the boards this app reads. Roles stay counted after they close, but counting began in November 2026, so older weeks only have roles that were still open then, and look smaller than they were. Comparing weeks starts in January 2027. A board added later adds its roles to the weeks they were posted."
          />
          <Catalog />
          <ToggleGroup
            size="sm"
            variant="outline"
            aria-label="Trends by"
            value={[by]}
            onValueChange={(v) =>
              v[0] &&
              void navigate({
                search: { by: v[0] === "country" ? undefined : (v[0] as Dimension) },
                replace: true,
              })
            }
          >
            {(Object.keys(labels) as Dimension[]).map((d) => (
              <ToggleGroupItem key={d} value={d}>
                {labels[d]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Tile title={`Most new roles last week, by ${labels[by].toLowerCase()}`}>
            {!rows && <RowSkeletons />}
            {rows?.length === 0 && (
              <p className="text-muted-foreground px-2.5 py-3 text-[13px]">
                Nothing counted yet. Roles are counted once an hour.
              </p>
            )}
            {rows && rows.length > 0 && (
              <Table>
                <TableCaption className="sr-only">
                  New roles a week by {labels[by].toLowerCase()}, for the last {weeksShown} weeks.
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>{labels[by]}</TableHead>
                    <TableHead>{weeksShown} weeks</TableHead>
                    <TableHead className={cn("text-end", comparable && "hidden sm:table-cell")}>
                      Last week
                    </TableHead>
                    {comparable && (
                      <TableHead
                        className="text-end"
                        title={`The last ${comparedWeeks} full weeks against the ${comparedWeeks} before them`}
                      >
                        Change
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ key, label, weeks }) => {
                    const roles = new Map(weeks.map((w) => [w.week, w.roles]))
                    const filled = allWeeks.map((w) => ({ week: w, roles: roles.get(w) ?? 0 }))
                    return (
                      <TableRow key={key}>
                        <TableCell className="w-full whitespace-normal">
                          <Link to="/jobs" search={{ q: label }} className="hover:underline">
                            {label}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Weeks label={label} weeks={filled} />
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-end tabular-nums",
                            comparable && "hidden sm:table-cell"
                          )}
                        >
                          {(roles.get(week - weekMs) ?? 0).toLocaleString("en")}
                        </TableCell>
                        {comparable && (
                          <TableCell className="text-end whitespace-nowrap tabular-nums">
                            {changeOf(filled.map((w) => w.roles))}
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </Tile>
        </div>
      </ScrollArea>
    </div>
  )
}
