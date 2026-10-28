import type { Preferences } from "@convex/api/features/preferences/validators"

import { cn } from "@/lib/utils"

type Values = typeof Preferences.inferIn

// Each part of someone's profile is a block. Filled parts drop in solid, the rest
// stay as dashed outlines, so the pile shows at a glance what the platform knows.
const blocks: { label: string; span: string; color: string; filled: (v: Values) => boolean }[] = [
  {
    label: "Who you are",
    span: "col-span-3",
    color: "bg-violet-500/80",
    filled: (v) => !!v.identity.trim(),
  },
  {
    label: "Interests",
    span: "col-span-2",
    color: "bg-emerald-500/80",
    filled: (v) => v.interests.length > 0,
  },
  {
    label: "Avoid",
    span: "col-span-1",
    color: "bg-rose-500/80",
    filled: (v) => v.avoid.length > 0,
  },
  {
    label: "Growth",
    span: "col-span-2",
    color: "bg-amber-500/80",
    filled: (v) => !!v.growthGoal.trim() || v.skillsToBuild.length > 0,
  },
  {
    label: "Places",
    span: "col-span-2",
    color: "bg-sky-500/80",
    filled: (v) => v.locations.length > 0 || v.workMode !== "any",
  },
  {
    label: "Companies",
    span: "col-span-2",
    color: "bg-teal-500/80",
    filled: (v) => v.companies.length > 0 || !!v.companyTraits.trim(),
  },
  {
    label: "Red flags",
    span: "col-span-2",
    color: "bg-orange-500/80",
    filled: (v) => v.redFlagCompanies.length > 0 || !!v.redFlags.trim(),
  },
  {
    label: "Answers",
    span: "col-span-4",
    color: "bg-indigo-500/80",
    filled: (v) => Object.values(v.answers).some((a) => a.trim()),
  },
]

export const IdentityBlocks = ({ values }: { values: Values }) => {
  const filled = blocks.filter((b) => b.filled(values)).length
  return (
    <figure className="flex w-60 shrink-0 flex-col gap-2">
      <div
        role="img"
        aria-label={`Your profile: ${filled} of ${blocks.length} parts filled in`}
        className="grid grid-cols-6 gap-1"
      >
        {blocks.map((b) =>
          b.filled(values) ? (
            <span
              key={b.label}
              className={cn(
                "animate-in fade-in slide-in-from-top-3 flex h-9 items-end rounded-md px-1.5 pb-1 text-[10px] font-medium text-white duration-300 motion-reduce:animate-none",
                b.span,
                b.color
              )}
            >
              {b.label}
            </span>
          ) : (
            <span
              key={b.label}
              className={cn(
                "text-muted-foreground flex h-9 items-end rounded-md border border-dashed px-1.5 pb-1 text-[10px]",
                b.span
              )}
            >
              {b.label}
            </span>
          )
        )}
      </div>
      <figcaption className="text-muted-foreground text-xs">
        {filled} of {blocks.length} parts filled in. Each one helps match you to the right roles.
      </figcaption>
    </figure>
  )
}
