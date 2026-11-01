import { Calendar03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useRef, useState } from "react"

import { LazyCalendar } from "@/components/lazy-calendar"
import { Button } from "@/components/ui/button"
import { Popover, PopoverCreateHandle, PopoverPopup, PopoverTrigger } from "@/components/ui/popover"

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

// With a time and no offset, this reads as the person's own day rather than UTC's.
const fromIso = (iso: string) => new Date(`${iso}T00:00`)

const toIso = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")

/** The coss date picker, for a form: it submits YYYY-MM-DD under `name`. */
export const DatePicker = ({
  id,
  name,
  defaultValue = "",
}: {
  id?: string
  name: string
  defaultValue?: string
}) => {
  const [value, setValue] = useState(defaultValue)
  const popover = useRef(PopoverCreateHandle()).current
  const selected = value ? fromIso(value) : undefined

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Popover handle={popover}>
        <PopoverTrigger
          id={id}
          render={
            <Button
              variant="outline"
              className={`w-full justify-start px-2.5 font-normal ${selected ? "" : "text-muted-foreground"}`}
            />
          }
        >
          <HugeiconsIcon icon={Calendar03Icon} strokeWidth={2} aria-hidden />
          <span className="truncate">{selected ? dateFormat.format(selected) : "Pick a date"}</span>
        </PopoverTrigger>
        <PopoverPopup>
          <LazyCalendar
            mode="single"
            required
            defaultMonth={selected}
            selected={selected}
            onSelect={(date: Date) => {
              setValue(toIso(date))
              popover.close()
            }}
          />
        </PopoverPopup>
      </Popover>
    </>
  )
}
