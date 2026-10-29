import { api } from "@convex/_generated/api"
import type { Doc, Id } from "@convex/_generated/dataModel"
import { useMutation } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"
import { useActionState, useRef } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogCreateHandle,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { messageOf, Row, Section } from "@/features/account/settings"
import { useCalendarSettings } from "@/features/calendar/saved"

type Page = Doc<"bookingPages">

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const options = (values: number[], label: (n: number) => string) =>
  values.map((n) => ({ value: String(n), label: label(n) }))
const lengths = options([15, 30, 45, 60, 90], (n) => `${n} min`)
const hourOptions = options(
  Array.from({ length: 25 }, (_, h) => h),
  (h) => `${String(h).padStart(2, "0")}:00`
)
const notices = options([0, 2, 12, 24, 48], (n) => (n ? `${n} hours` : "None"))
const horizons = options([7, 14, 30, 60], (n) => `${n} days`)
const none = "none"

const linkOf = (page: Page) => `${location.origin}/book/${page.slug}`
const summary = (page: Page) => {
  const days =
    page.days.length === 5 && !page.days.includes(0) && !page.days.includes(6)
      ? "Weekdays"
      : [...page.days]
          .sort((a, b) => a - b)
          .map((d) => weekdays[d])
          .join(", ")
  const pad = (h: number) => `${String(h).padStart(2, "0")}:00`
  return `${page.minutes} min · ${days} ${pad(page.startHour)}–${pad(page.endHour)} · ${page.timeZone}`
}

// A Select that posts its value with the form, like a native one.
const Pick = ({
  name,
  label,
  items,
  defaultValue,
}: {
  name: string
  label: string
  items: { value: string; label: string }[]
  defaultValue: string
}) => (
  <div className="grid gap-1.5">
    <Label>{label}</Label>
    <Select name={name} items={items} defaultValue={defaultValue}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  </div>
)

/** Makes a booking page, or edits `page`. */
const PageDialog = ({ page, trigger }: { page?: Page; trigger: React.ReactElement }) => {
  const save = useMutation(api.booking.savePage)
  const applications = useQuery(api.applications.list) ?? []
  const zone = useCalendarSettings()?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const handle = useRef(DialogCreateHandle()).current
  const [error, submit, pending] = useActionState(async (_: string | undefined, form: FormData) => {
    const text = (name: string) => {
      const value = form.get(name)
      return typeof value === "string" ? value.trim() : ""
    }
    const number = (name: string) => Number(text(name))
    const application = text("applicationId")
    try {
      await save({
        ...(page && { id: page._id }),
        title: text("title"),
        minutes: number("minutes"),
        startHour: number("startHour"),
        endHour: number("endHour"),
        days: form.getAll("days").map(Number),
        noticeHours: number("noticeHours"),
        horizonDays: number("horizonDays"),
        timeZone: page?.timeZone ?? zone,
        ...(application !== none && { applicationId: application as Id<"applications"> }),
        location: text("location"),
        active: page?.active ?? true,
      })
      handle.close()
      return undefined
    } catch (cause) {
      return messageOf(cause)
    }
  }, undefined)
  return (
    <Dialog handle={handle}>
      <DialogTrigger render={trigger} />
      <DialogPopup className="sm:max-w-lg">
        <form action={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{page ? "Edit booking page" : "New booking page"}</DialogTitle>
            <DialogDescription>
              A link recruiters can book time on. Hours are in {page?.timeZone ?? zone}.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="page-title">Title</Label>
              <Input
                id="page-title"
                name="title"
                required
                defaultValue={page?.title ?? "Intro call"}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Pick
                name="minutes"
                label="Length"
                items={lengths}
                defaultValue={String(page?.minutes ?? 30)}
              />
              <Pick
                name="startHour"
                label="From"
                items={hourOptions.slice(0, 24)}
                defaultValue={String(page?.startHour ?? 9)}
              />
              <Pick
                name="endHour"
                label="To"
                items={hourOptions.slice(1)}
                defaultValue={String(page?.endHour ?? 17)}
              />
            </div>
            <fieldset className="grid gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">Days</legend>
              <div className="flex flex-wrap gap-1.5">
                {weekdays.map((name, d) => (
                  <label key={name} className="cursor-pointer">
                    <input
                      type="checkbox"
                      name="days"
                      value={d}
                      defaultChecked={page ? page.days.includes(d) : d >= 1 && d <= 5}
                      className="peer sr-only"
                    />
                    <span className="peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-ring inline-flex h-7 items-center rounded-md border px-2.5 text-xs peer-focus-visible:ring-2">
                      {name}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <Pick
                name="noticeHours"
                label="Notice"
                items={notices}
                defaultValue={String(page?.noticeHours ?? 12)}
              />
              <Pick
                name="horizonDays"
                label="Open for"
                items={horizons}
                defaultValue={String(page?.horizonDays ?? 30)}
              />
            </div>
            <Pick
              name="applicationId"
              label="Application"
              items={[
                { value: none, label: "By the guest's email" },
                ...applications.map((a) => ({ value: a._id, label: `${a.company} · ${a.role}` })),
              ]}
              defaultValue={page?.applicationId ?? none}
            />
            <div className="grid gap-1.5">
              <Label htmlFor="page-location">Where</Label>
              <Input
                id="page-location"
                name="location"
                placeholder="Phone, an office, or a video link"
                defaultValue={page?.location ?? ""}
              />
            </div>
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              {page ? "Save" : "Create page"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  )
}

// Links anyone can book time on, each opening on your free time. Bookings land on the
// Calendar as interviews, under the page's application or the guest's company.
export const BookingSection = () => {
  const pages = useQuery(api.booking.pages)
  const save = useMutation(api.booking.savePage)
  const remove = useMutation(api.booking.removePage)
  if (!pages) return null
  return (
    <div id="booking" className="scroll-mt-4">
      <Section
        title="Booking pages"
        status={
          <PageDialog
            trigger={
              <Button size="sm" variant="outline">
                New page
              </Button>
            }
          />
        }
      >
        {pages.length === 0 && (
          <p className="text-muted-foreground px-4 py-3 text-sm">
            No booking pages yet. Make one and send its link to a recruiter.
          </p>
        )}
        {pages.map((page) => {
          const { _id, _creationTime, userId: _userId, slug: _slug, ...fields } = page
          return (
            <Row key={_id} label={page.title} description={summary(page)}>
              <Switch
                aria-label={page.active ? "Close this page" : "Open this page"}
                checked={page.active}
                onCheckedChange={(active) => void save({ id: _id, ...fields, active })}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => void navigator.clipboard.writeText(linkOf(page))}
              >
                Copy link
              </Button>
              <PageDialog
                page={page}
                trigger={
                  <Button size="sm" variant="ghost">
                    Edit
                  </Button>
                }
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (window.confirm(`Delete “${page.title}”? Its link stops working.`))
                    void remove({ id: _id })
                }}
              >
                Delete
              </Button>
            </Row>
          )
        })}
      </Section>
    </div>
  )
}
