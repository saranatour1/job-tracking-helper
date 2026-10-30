import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import { Group, GroupText } from "@/components/ui/group"
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
import { cn } from "@/lib/utils"

import { type FilterField, type Filters, fieldOptions, filterFields, optionLabel } from "./data"
import { useSource } from "./source"

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
}) => {
  const { applications, goals } = useSource()
  return (
    <Menu>
      <MenuTrigger render={trigger} />
      <MenuPopup align="end" className="min-w-48">
        <MenuGroup>
          <MenuGroupLabel>Filter by</MenuGroupLabel>
          {filterFields.map((field) => (
            <MenuSub key={field}>
              <MenuSubTrigger>{fieldLabels[field]}</MenuSubTrigger>
              <MenuSubPopup>
                {fieldOptions(field, applications, goals).map((option) => (
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
}

// The coss group joins the segments into one chip with shared borders.
const segment = "h-6 rounded-md px-2 text-xs font-medium sm:text-xs"

// Renders one chip per active filter, such as "Status is any of Applied, Interviewing".
export const FilterChips = ({
  filters,
  onChange,
}: {
  filters: Filters
  onChange: (filters: Filters) => void
}) => {
  const { goals } = useSource()
  return filterFields
    .filter((field) => filters[field]?.length)
    .map((field) => (
      <Group key={field} aria-label={`${fieldLabels[field]} filter`}>
        <GroupText className={segment}>{fieldLabels[field]}</GroupText>
        <GroupText className={cn(segment, "text-muted-foreground bg-transparent")}>
          {filters[field]!.length > 1 ? "is any of" : "is"}
        </GroupText>
        <GroupText className={cn(segment, "text-foreground max-w-56 bg-transparent")}>
          <span className="truncate">
            {filters[field]!.map((v) => optionLabel(field, v, goals)).join(", ")}
          </span>
        </GroupText>
        <Button
          variant="outline"
          size="icon-xs"
          className="size-6 sm:size-6"
          aria-label={`Remove ${fieldLabels[field]} filter`}
          onClick={() => onChange({ ...filters, [field]: [] })}
        >
          <HugeiconsIcon icon={Cancel01Icon} />
        </Button>
      </Group>
    ))
}
