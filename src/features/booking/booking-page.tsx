import { api } from "@/lib/api"
import { instantOf, isOpen, offsetOf, slotProblem } from "@convex/features/booking/slots"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { useMutation } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"
import { useActionState, useMemo } from "react"

import {
  type CalEvent,
  downloadICS,
  Kloq,
  KloqNav,
  KloqToolbar,
  localZone,
  parseInstant,
} from "@/components/kloq"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { messageOf } from "@/features/account/settings"

const minute = 60_000
const day = 24 * 60 * minute
const draftId = "draft"
// The booking form is the panel; kloq's own editor never opens here.
const slots = { EventPanel: () => null }

export type BookingSearch = { at?: number; booked?: number }
export const bookingSearch = (search: Record<string, unknown>): BookingSearch => ({
  at: Number.isInteger(search.at) ? Number(search.at) : undefined,
  booked: Number.isInteger(search.booked) ? Number(search.booked) : undefined,
})

const whenLabel = (start: number, minutes: number) => {
  const time = (ms: number) =>
    new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  const date = new Date(start).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
  return `${date}, ${time(start)} – ${time(start + minutes * minute)}`
}

// A public page anyone with the link can book time on. It shows the host's free time in
// the guest's own zone, with the host's beside it; busy time is hatched and refused, and
// the server checks the chosen time again before it books it.
export const BookingPage = ({ slug }: { slug: string }) => {
  const search = useSearch({ from: "/book/$slug" })
  const navigate = useNavigate({ from: "/book/$slug" })
  // The start of yesterday in UTC, so the query's arguments only change once a day.
  const from = Math.floor(Date.now() / day) * day - day
  const data = useQuery(api.booking.page, { slug, from })
  const book = useMutation(api.booking.book)
  const write = (next: BookingSearch) => void navigate({ search: next, replace: true })

  // React clears the form after each try, so what the guest typed comes back with the error.
  type Tried = { error?: string; name?: string; email?: string; note?: string }
  const [tried, submit, pending] = useActionState(
    async (_: Tried, form: FormData): Promise<Tried> => {
      const text = (name: string) => {
        const value = form.get(name)
        return typeof value === "string" ? value.trim() : ""
      }
      const typed = { name: text("name"), email: text("email"), note: text("note") }
      if (search.at === undefined) return { ...typed, error: "Pick a time first." }
      try {
        await book({
          slug,
          start: search.at,
          name: typed.name,
          email: typed.email,
          ...(typed.note && { note: typed.note }),
        })
        write({ booked: search.at })
        return {}
      } catch (cause) {
        return { ...typed, error: messageOf(cause) }
      }
    },
    {}
  )

  const constraints = useMemo(() => {
    if (!data) return undefined
    const now = Date.now()
    return {
      minDate: new Date(now + data.hours.noticeHours * 60 * minute),
      isSlotDisabled: (slot: { start: Date; end: Date; allDay: boolean }) =>
        slot.allDay ||
        !isOpen(data.hours, slot.start.getTime(), slot.end.getTime(), data.busy, now),
    }
  }, [data])

  if (data === undefined) return <div className="bg-background h-svh" />
  if (data === null)
    return (
      <main className="grid h-svh place-items-center p-6 text-center">
        <div className="grid gap-1">
          <h1 className="font-heading text-lg font-semibold">This booking page isn't open</h1>
          <p className="text-muted-foreground text-sm">
            Ask whoever sent you the link for a new one.
          </p>
        </div>
      </main>
    )

  const { hours } = data
  const guestZone = localZone()
  // The host's hours, moved into the guest's day, so the grid shows just that part.
  const shift = (offsetOf(Date.now(), guestZone) - offsetOf(Date.now(), hours.timeZone)) / 60
  const dayStart = Math.floor(hours.startHour + shift)
  const dayEnd = Math.ceil(hours.endHour + shift)
  const fits = dayStart >= 0 && dayEnd <= 24
  const draft: CalEvent | undefined =
    search.at === undefined
      ? undefined
      : {
          id: draftId,
          title: "Your booking",
          start: instantOf(search.at),
          end: instantOf(search.at + hours.minutes * minute),
          color: "emerald",
        }
  const propose = (start: number) => {
    const quarter = Math.round(start / (15 * minute)) * 15 * minute
    if (!slotProblem(hours, quarter, data.busy, Date.now())) write({ at: quarter })
  }
  const booked = search.booked
  const bookedEvent: CalEvent | undefined = booked
    ? {
        id: `booking-${booked}`,
        title: `${data.title} with ${data.host}`,
        start: instantOf(booked),
        end: instantOf(booked + hours.minutes * minute),
        ...(data.location && { location: data.location }),
      }
    : undefined

  return (
    <main className="bg-background flex h-svh flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-5 border-b p-5 md:w-80 md:border-e md:border-b-0">
        <div className="grid gap-1">
          <p className="text-muted-foreground text-xs">Book time with</p>
          <h1 className="font-heading text-xl font-semibold tracking-tight">{data.host}</h1>
          <p className="text-muted-foreground text-sm">
            {data.title} · {hours.minutes} min
            {data.location ? ` · ${data.location}` : ""}
          </p>
          <p className="text-muted-foreground text-xs">Times are in your zone, {guestZone}.</p>
        </div>
        {bookedEvent && booked ? (
          <div className="grid gap-3 border-t pt-5">
            <p className="text-sm font-medium">You're booked.</p>
            <p className="text-muted-foreground text-sm">{whenLabel(booked, hours.minutes)}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => downloadICS(bookedEvent)}>
                Add to your calendar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => write({})}>
                Book another time
              </Button>
            </div>
          </div>
        ) : search.at !== undefined ? (
          <form action={submit} className="grid gap-3 border-t pt-5">
            <p className="text-sm font-medium">{whenLabel(search.at, hours.minutes)}</p>
            <div className="grid gap-1.5">
              <Label htmlFor="book-name">Name</Label>
              <Input
                id="book-name"
                name="name"
                autoComplete="name"
                required
                defaultValue={tried.name}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="book-email">Email</Label>
              <Input
                id="book-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                defaultValue={tried.email}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="book-note">Anything to share? (optional)</Label>
              <Textarea id="book-note" name="note" rows={3} defaultValue={tried.note} />
            </div>
            {tried.error && (
              <p role="alert" className="text-destructive text-sm">
                {tried.error}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                Confirm
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => write({})}>
                Pick another time
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-muted-foreground border-t pt-5 text-sm">
            Click a free time on the calendar. Hatched time isn't open.
          </p>
        )}
      </aside>
      <div className="min-h-0 min-w-0 flex-1">
        <Kloq
          theme="coss"
          defaultView="week"
          events={draft ? [draft] : []}
          onEventsChange={(next) => {
            const moved = next.find((e) => e.id === draftId)
            if (moved) propose(parseInstant(moved.start))
          }}
          onSlotClick={({ start }) => propose(start.getTime())}
          constraints={constraints}
          components={slots}
          snapMinutes={15}
          minEventMinutes={hours.minutes}
          {...(fits && { dayStartHour: dayStart, dayEndHour: dayEnd })}
          workingHours={fits ? { start: dayStart, end: dayEnd } : false}
          timeZones={
            guestZone === hours.timeZone ? [] : [{ timeZone: hours.timeZone, label: "Host" }]
          }
          weekStartsOn={1}
          designMode={false}
          commandPalette={false}
        >
          <KloqToolbar>
            <KloqNav />
            <span className="text-muted-foreground text-xs">{hours.minutes}-minute slots</span>
          </KloqToolbar>
        </Kloq>
      </div>
    </main>
  )
}
