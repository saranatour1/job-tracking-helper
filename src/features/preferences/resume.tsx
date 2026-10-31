import { api } from "@/lib/api"
import { useQuery } from "convex-helpers/react/cache/hooks"
import { lazy, Suspense } from "react"

import { ScrollArea } from "@/components/ui/scroll-area"
import { PageHeader } from "@/features/shell/page-header"

import { ResumeTab } from "./preferences"

// pdf.js is loaded only on this page, and only in the browser.
const PdfViewer = lazy(() => import("./pdf-viewer").then((m) => ({ default: m.PdfViewer })))

// The Resume page: the file and a review of it on the left, the PDF itself on the right
// where there's room. Same shell as Preferences.
export const Resume = () => {
  const data = useQuery(api.preferences.get)
  const resume = data?.resume
  const pdf = resume?.url && /\.pdf$/i.test(resume.name) ? resume.url : null
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader crumbs={[{ label: "Resume" }]} />
      <div className="flex min-h-0 flex-1">
        {data && <ResumeTab resume={data.resume} review={data.review} />}
        {resume && (
          <aside
            aria-label="Resume preview"
            className="hidden w-[26rem] shrink-0 flex-col border-s lg:flex"
          >
            <p className="text-muted-foreground truncate border-b px-3 py-2 text-xs">
              {resume.name}
            </p>
            <ScrollArea className="min-h-0 flex-1">
              {pdf && typeof window !== "undefined" ? (
                <Suspense fallback={null}>
                  <PdfViewer url={pdf} />
                </Suspense>
              ) : (
                <p className="text-muted-foreground p-3 text-center text-xs">
                  No preview for this file type; PDFs show here.
                </p>
              )}
            </ScrollArea>
          </aside>
        )}
      </div>
    </div>
  )
}
