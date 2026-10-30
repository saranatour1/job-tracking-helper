import { api } from "@convex/_generated/api"
import { useQuery } from "convex-helpers/react/cache/hooks"

import { PageHeader } from "@/features/shell/page-header"

import { ResumeTab } from "./preferences"

// The Resume page: the file, and a review of it. Same shell as Preferences.
export const Resume = () => {
  const data = useQuery(api.preferences.get)
  return (
    <div className="soft-theme bg-background text-foreground flex h-svh flex-col rounded-[inherit] md:h-[calc(100svh-1rem)]">
      <PageHeader crumbs={[{ label: "Resume" }]} />
      {data && <ResumeTab resume={data.resume} review={data.review} />}
    </div>
  )
}
