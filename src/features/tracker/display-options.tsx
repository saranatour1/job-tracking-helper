import { DashboardSquare01Icon, LeftToRightListBulletIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Label } from "@/components/ui/label"
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Toggle } from "@/components/ui/toggle"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export const groupings = {
  status: "Status",
  priority: "Priority",
  goal: "Goal",
  none: "No grouping",
}
export const orderings = { priority: "Priority", created: "Created", company: "Company" }
export const properties = {
  id: "ID",
  priority: "Priority",
  goal: "Goal",
  labels: "Labels",
  location: "Location",
  created: "Created",
}

export type Display = {
  layout: "board" | "list"
  groupBy: keyof typeof groupings
  orderBy: keyof typeof orderings
  showEmpty: boolean
  shown: (keyof typeof properties)[]
}

export const defaultDisplay: Display = {
  layout: "board",
  groupBy: "status",
  orderBy: "priority",
  // Every status keeps its column, so a card always has somewhere to be dragged.
  showEmpty: true,
  shown: ["id", "priority", "goal", "labels", "created"],
}

const items = (record: Record<string, string>) =>
  Object.entries(record).map(([value, label]) => ({ value, label }))

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-4">
    <Label className="text-muted-foreground font-normal">{label}</Label>
    {children}
  </div>
)

const Choice = <T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: Record<T, string>
  onChange: (value: T) => void
  label: string
}) => (
  <Select value={value} items={items(options)} onValueChange={(v) => onChange(v as T)}>
    <SelectTrigger size="sm" className="w-36" aria-label={label}>
      <SelectValue />
    </SelectTrigger>
    <SelectPopup>
      {items(options).map((o) => (
        <SelectItem key={o.value} value={o.value}>
          {o.label}
        </SelectItem>
      ))}
    </SelectPopup>
  </Select>
)

export const DisplayOptions = ({
  display,
  onChange,
  trigger,
}: {
  display: Display
  onChange: (display: Display) => void
  trigger: React.ReactElement
}) => {
  const set = <K extends keyof Display>(key: K, value: Display[K]) =>
    onChange({ ...display, [key]: value })
  return (
    <Popover>
      <PopoverTrigger render={trigger} />
      <PopoverPopup align="end" className="w-80">
        <div className="flex flex-col gap-4">
          <ToggleGroup
            variant="outline"
            className="w-full *:flex-1"
            value={[display.layout]}
            onValueChange={(v) => v[0] && set("layout", v[0] as Display["layout"])}
          >
            <ToggleGroupItem value="list">
              <HugeiconsIcon icon={LeftToRightListBulletIcon} /> List
            </ToggleGroupItem>
            <ToggleGroupItem value="board">
              <HugeiconsIcon icon={DashboardSquare01Icon} /> Board
            </ToggleGroupItem>
          </ToggleGroup>
          <Row label={display.layout === "board" ? "Columns" : "Grouping"}>
            <Choice
              label="Grouping"
              value={display.groupBy}
              options={groupings}
              onChange={(v) => set("groupBy", v)}
            />
          </Row>
          <Row label="Ordering">
            <Choice
              label="Ordering"
              value={display.orderBy}
              options={orderings}
              onChange={(v) => set("orderBy", v)}
            />
          </Row>
          <Row label="Show empty groups">
            <Switch checked={display.showEmpty} onCheckedChange={(v) => set("showEmpty", v)} />
          </Row>
          <div className="flex flex-col gap-2 border-t pt-3">
            <span className="text-muted-foreground text-xs">Display properties</span>
            <div className="flex flex-wrap gap-1.5">
              {items(properties).map((p) => (
                <Toggle
                  key={p.value}
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  pressed={display.shown.includes(p.value as keyof typeof properties)}
                  onPressedChange={(on) =>
                    set(
                      "shown",
                      on
                        ? [...display.shown, p.value as keyof typeof properties]
                        : display.shown.filter((s) => s !== p.value)
                    )
                  }
                >
                  {p.label}
                </Toggle>
              ))}
            </div>
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  )
}
