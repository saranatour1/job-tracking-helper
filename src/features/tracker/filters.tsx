import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "@/components/ui/menu"

import { type FilterField, type Filters, fieldOptions, filterFields, optionLabel } from "./data"

export const fieldLabels: Record<FilterField, string> = {
  status: "Status",
  priority: "Priority",
  label: "Labels",
  goal: "Goal",
  company: "Company",
  method: "Method",
}

export const toggleFilter = (filters: Filters, field: FilterField, value: string): Filters => {
  const current = filters[field] ?? []
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
  return { ...filters, [field]: next }
}

// The add-filter menu has one submenu per field and one checkbox per value.
export const FilterMenu = ({
  filters,
  onChange,
  trigger,
}: {
  filters: Filters
  onChange: (filters: Filters) => void
  trigger: React.ReactElement
}) => (
  <Menu>
    <MenuTrigger render={trigger} />
    <MenuPopup align="end" className="min-w-48">
      <MenuGroup>
        <MenuGroupLabel>Filter by</MenuGroupLabel>
        {filterFields.map((field) => (
          <MenuSub key={field}>
            <MenuSubTrigger>{fieldLabels[field]}</MenuSubTrigger>
            <MenuSubPopup>
              {fieldOptions(field).map((option) => (
                <MenuCheckboxItem
                  key={option.value}
                  checked={filters[field]?.includes(option.value) ?? false}
                  onCheckedChange={() => onChange(toggleFilter(filters, field, option.value))}
                >
                  {option.label}
                </MenuCheckboxItem>
              ))}
            </MenuSubPopup>
          </MenuSub>
        ))}
      </MenuGroup>
    </MenuPopup>
  </Menu>
)

// Renders one chip per active filter, such as "Status is any of Applied, Interviewing".
export const FilterChips = ({
  filters,
  onChange,
}: {
  filters: Filters
  onChange: (filters: Filters) => void
}) =>
  filterFields
    .filter((field) => filters[field]?.length)
    .map((field) => (
      <span
        key={field}
        className="bg-background flex h-6 items-center overflow-hidden rounded-md border text-xs"
      >
        <span className="px-2 font-medium">{fieldLabels[field]}</span>
        <span className="text-muted-foreground border-x px-2 leading-6">
          {filters[field]!.length > 1 ? "is any of" : "is"}
        </span>
        <span className="max-w-56 truncate px-2">
          {filters[field]!.map((v) => optionLabel(field, v)).join(", ")}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="rounded-none border-s"
          aria-label={`Remove ${fieldLabels[field]} filter`}
          onClick={() => onChange({ ...filters, [field]: [] })}
        >
          <HugeiconsIcon icon={Cancel01Icon} />
        </Button>
      </span>
    ))
