import { api } from "@convex/_generated/api"
import type { Doc, Id } from "@convex/_generated/dataModel"
import { useMutation } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"
import { createContext, useContext } from "react"

import type { MailEvent } from "./mail"
import {
  type Application,
  type Label,
  type Status,
  today,
  updateApplication,
  useApplications,
} from "./data"

type Editable = Pick<
  Application,
  "role" | "company" | "priority" | "labels" | "method" | "location" | "description" | "tasks"
>

// Where the tracker's applications come from and how edits are saved. Pipeline and an
// application's page read Convex; Goals and Views still use the sample data.
export type Source = {
  // Convex rather than the sample data.
  real: boolean
  applications: Application[]
  // False while the first load is on its way.
  loaded: boolean
  setStatus: (id: string, status: Status) => void
  update: (id: string, patch: Partial<Editable>) => void
  addNote: (id: string, text: string) => void
  // Goals are still sample data, so only sample applications can join one.
  goals: boolean
  setGoal: (id: string, goalId?: string) => void
  // Company mail filed under applications, newest first; none in the sample data.
  mail: MailEvent[]
  // Accepts or dismisses the status an email suggests.
  answerMail: (eventId: MailEvent["id"], accept: boolean) => void
  // Files an email under an application.
  fileMail: (eventId: MailEvent["id"], applicationId: string) => void
}

const SourceContext = createContext<Source | null>(null)

const useSampleSource = (): Source => {
  const applications = useApplications()
  const find = (id: string) => applications.find((a) => a.id === id)
  return {
    real: false,
    // Sample ids double as their short code, like APP-21.
    applications: applications.map((a) => ({ ...a, code: a.id })),
    loaded: true,
    setStatus: (id, status) => {
      const a = find(id)
      if (a && a.status !== status)
        updateApplication(id, { status, history: [...a.history, { status, at: today }] })
    },
    update: updateApplication,
    addNote: (id, text) =>
      updateApplication(id, { notes: [...(find(id)?.notes ?? []), { text, at: today }] }),
    goals: true,
    setGoal: (id, goalId) => updateApplication(id, { goalId }),
    mail: [],
    answerMail: () => undefined,
    fileMail: () => undefined,
  }
}

/** The applications on screen: Convex inside a ConvexSource, the sample data elsewhere. */
export const useSource = () => {
  const sample = useSampleSource()
  return useContext(SourceContext) ?? sample
}

const isoOf = (at: number) => new Date(at).toISOString()

// A Convex application in the shape the tracker draws. Details it doesn't have yet read
// as empty, and an application from before history was kept starts at its creation.
export const fromDoc = (d: Doc<"applications">): Application => ({
  id: d._id,
  ...(d.number && { code: `APP-${d.number}` }),
  role: d.role,
  company: d.company,
  status: d.status,
  priority: d.priority ?? "none",
  // Labels are free text here; the sample list only seeds the label picker.
  labels: (d.labels ?? []) as Label[],
  method: d.method ?? "Company site",
  location: d.location ?? "",
  createdAt: isoOf(d._creationTime),
  description: d.description ?? "",
  url: d.url,
  history: (d.history ?? [{ status: d.status, at: d._creationTime }]).map((e) => ({
    status: e.status,
    at: isoOf(e.at),
    ...(e.note && { note: e.note }),
  })),
  tasks: d.tasks,
  notes: d.notes?.map((n) => ({ text: n.text, at: isoOf(n.at) })),
})

export const ConvexSource = ({ children }: { children: React.ReactNode }) => {
  const docs = useQuery(api.applications.list)
  const setStatus = useMutation(api.applications.setStatus)
  const update = useMutation(api.applications.update)
  const addNote = useMutation(api.applications.addNote)
  const mail = useQuery(api.email.timeline)
  const answer = useMutation(api.email.resolveSuggestion)
  const file = useMutation(api.email.assign)
  const id = (s: string) => s as Id<"applications">
  const source: Source = {
    real: true,
    applications: (docs ?? []).map(fromDoc),
    loaded: docs !== undefined,
    setStatus: (s, status) => void setStatus({ id: id(s), status }),
    update: (s, patch) => void update({ id: id(s), ...patch }),
    addNote: (s, text) => void addNote({ id: id(s), text }),
    goals: false,
    setGoal: () => undefined,
    mail: mail ?? [],
    answerMail: (eventId, accept) => void answer({ eventId, accept }),
    fileMail: (eventId, s) => void file({ eventId, applicationId: id(s) }),
  }
  return <SourceContext value={source}>{children}</SourceContext>
}
