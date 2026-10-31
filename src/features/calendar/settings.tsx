import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { FunctionReturnType } from "convex/server"
import type { api } from "@/lib/api"

import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "@/components/ui/combobox"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Row, Section } from "@/features/account/settings"

import { useCalendarSettings, useSaveCalendarSettings } from "./saved"

type Settings = FunctionReturnType<typeof api.calendar.settings>

const zones = Intl.supportedValuesOf("timeZone")
const hours = Array.from({ length: 25 }, (_, h) => ({
  value: String(h),
  label: `${String(h).padStart(2, "0")}:00`,
}))

const Pick = ({
  label,
  value,
  items,
  onChange,
  className = "w-56",
}: {
  label: string
  value: string | null
  items: { value: string; label: string }[]
  onChange: (value: string) => void
  className?: string
}) => (
  <Select value={value} items={items} onValueChange={(v) => v !== null && onChange(String(v))}>
    <SelectTrigger size="sm" className={className} aria-label={label}>
      <SelectValue placeholder={label} />
    </SelectTrigger>
    <SelectPopup>
      {items.map((o) => (
        <SelectItem key={o.value} value={o.value}>
          {o.label}
        </SelectItem>
      ))}
    </SelectPopup>
  </Select>
)

// Over 400 zones, so you type to find one ("berlin", "new_york").
export const ZonePick = ({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string | null
  options: string[]
  onChange: (zone: string) => void
}) => (
  <Combobox items={options} value={value} onValueChange={(z) => z && onChange(z)}>
    <ComboboxInput size="sm" className="w-56" aria-label={label} placeholder={label} />
    <ComboboxPopup>
      <ComboboxEmpty>No time zone matches.</ComboboxEmpty>
      <ComboboxList>
        {(zone: string) => (
          <ComboboxItem key={zone} value={zone}>
            {zone}
          </ComboboxItem>
        )}
      </ComboboxList>
    </ComboboxPopup>
  </Combobox>
)

// How the Calendar reads: your zone, others beside it, the clock, the week and the hours.
// Each change saves at once; anything unset follows your browser.
export const CalendarSection = () => {
  const settings = useCalendarSettings()
  const save = useSaveCalendarSettings()
  if (!settings) return null
  const set = (patch: Partial<Settings>) => void save({ ...settings, ...patch })
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone
  const extra = settings.extraTimeZones ?? []
  return (
    <Section title="Calendar">
      <Row
        label="Time zone"
        description="Times on the Calendar are shown here; your browser's zone unless you pick another. Interview times keep the zone their email gave."
      >
        <ZonePick
          label="Time zone"
          value={settings.timeZone ?? local}
          options={zones}
          onChange={(z) => set({ timeZone: z === local ? undefined : z })}
        />
      </Row>
      <Row
        label="Other time zones"
        description="Up to three, shown beside the hours, like where a company is."
      >
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {extra.map((z) => (
            <Button
              key={z}
              variant="outline"
              size="xs"
              aria-label={`Remove ${z}`}
              onClick={() =>
                set({
                  extraTimeZones: extra.filter((x) => x !== z).length
                    ? extra.filter((x) => x !== z)
                    : undefined,
                })
              }
            >
              {z}
              <HugeiconsIcon icon={Cancel01Icon} />
            </Button>
          ))}
          {extra.length < 3 && (
            <ZonePick
              label="Add a time zone"
              value={null}
              options={zones.filter((z) => !extra.includes(z))}
              onChange={(z) => set({ extraTimeZones: [...extra, z] })}
            />
          )}
        </div>
      </Row>
      <Row label="Clock" description="12 or 24 hours, or whatever your language uses.">
        <ToggleGroup
          size="sm"
          variant="outline"
          aria-label="Clock"
          value={[settings.hour12 === undefined ? "auto" : settings.hour12 ? "12" : "24"]}
          onValueChange={(v) =>
            v[0] && set({ hour12: v[0] === "auto" ? undefined : v[0] === "12" })
          }
        >
          <ToggleGroupItem value="auto">Auto</ToggleGroupItem>
          <ToggleGroupItem value="12">12h</ToggleGroupItem>
          <ToggleGroupItem value="24">24h</ToggleGroupItem>
        </ToggleGroup>
      </Row>
      <Row label="Week starts on" description="The first column of the week and month.">
        <ToggleGroup
          size="sm"
          variant="outline"
          aria-label="Week starts on"
          value={[String(settings.weekStartsOn ?? 1)]}
          onValueChange={(v) =>
            v[0] && set({ weekStartsOn: Number(v[0]) as NonNullable<Settings["weekStartsOn"]> })
          }
        >
          <ToggleGroupItem value="1">Monday</ToggleGroupItem>
          <ToggleGroupItem value="0">Sunday</ToggleGroupItem>
          <ToggleGroupItem value="6">Saturday</ToggleGroupItem>
        </ToggleGroup>
      </Row>
      <Row label="Hours shown" description="The part of the day the day and week views draw.">
        <Pick
          label="From"
          className="w-24"
          value={String(settings.dayStartHour ?? 0)}
          items={hours.slice(0, 24).filter((h) => Number(h.value) < (settings.dayEndHour ?? 24))}
          onChange={(v) => set({ dayStartHour: Number(v) || undefined })}
        />
        <span className="text-muted-foreground text-xs">to</span>
        <Pick
          label="To"
          className="w-24"
          value={String(settings.dayEndHour ?? 24)}
          items={hours.slice(1).filter((h) => Number(h.value) > (settings.dayStartHour ?? 0))}
          onChange={(v) => set({ dayEndHour: Number(v) === 24 ? undefined : Number(v) })}
        />
      </Row>
    </Section>
  )
}
