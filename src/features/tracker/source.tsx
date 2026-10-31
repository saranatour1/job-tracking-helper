import { api } from "@convex/_generated/api"
import type { Doc, Id } from "@convex/_generated/dataModel"
import { useMutation } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"
import { createContext, useContext } from "react"

import type { MailEvent } from "./mail"
import {
  type Application,
  type Goal,
  type Label,
  type Status,
  goals as sampleGoals,
  today,
  updateApplication,
  useApplications,
} from "./data"

type Editable = Pick<
  Application,
  "role" | "company" | "priority" | "labels" | "method" | "location" | "description" | "tasks"
>

// Where the tracker's applications and goals come from and how edits are saved. Every
// page reads Convex; the sample data is for the sample applications (APP-21) only.
export type Source = {
  // Convex rather than the sample data.
  real: boolean
  applications: Application[]
  goals: Goal[]
  // False while the first load is on its way.
  loaded: boolean
  setStatus: (id: string, status: Status) => void
  update: (id: string, patch: Partial<Editable>) => void
  addNote: (id: string, text: string) => void
  setGoal: (id: string, goalId?: string) => void
  // Company mail filed under applications, newest first; none in the sample data.
  mail: MailEvent[]
  // Accepts or dismisses the status an email suggests.
  answerMail: (eventId: MailEvent["id"], accept: boolean) => void
  // Files an email under an application.
  fileMail: (eventId: MailEvent["id"], applicationId: string) => void
  // Puts an application back where it was before Jev moved it.
  undoMove: (eventId: MailEvent["id"]) => void
  // Takes it off the board into the Archive, or back.
  archive: (id: string, archived: boolean) => void
  // Moves it to the Trash.
  trash: (id: string) => void
}

const SourceContext = createContext<Source | null>(null)

const useSampleSource = (): Source => {
  const applications = useApplications()
  const find = (id: string) => applications.find((a) => a.id === id)
  return {
    real: false,
    // Sample ids double as their short code, like APP-21.
    applications: applications.map((a) => ({ ...a, code: a.id })),
    goals: sampleGoals,
    loaded: true,
    setStatus: (id, status) => {
      const a = find(id)
      if (a && a.status !== status)
        updateApplication(id, { status, history: [...a.history, { status, at: today }] })
    },
    update: updateApplication,
    addNote: (id, text) =>
      updateApplication(id, { notes: [...(find(id)?.notes ?? []), { text, at: today }] }),
    setGoal: (id, goalId) => updateApplication(id, { goalId }),
    mail: [],
    answerMail: () => undefined,
    fileMail: () => undefined,
    undoMove: () => undefined,
    archive: () => undefined,
    trash: () => undefined,
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
  code: `APP-${d.number}`,
  number: d.number,
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
  history: d.history.map((e) => ({
    status: e.status,
    at: isoOf(e.at),
    ...(e.note && { note: e.note }),
  })),
  tasks: d.tasks,
  notes: d.notes?.map((n) => ({ text: n.text, at: isoOf(n.at) })),
  goalId: d.goalId,
  ...(d.archivedAt !== undefined && { archived: true }),
})

export const ConvexSource = ({ children }: { children: React.ReactNode }) => {
  const docs = useQuery(api.applications.list)
  const goalDocs = useQuery(api.goals.list)
  const setGoal = useMutation(api.applications.setGoal)
  const fits = new Map((useQuery(api.loops.fits) ?? []).map((f) => [f.applicationId, f]))
  const setStatus = useMutation(api.applications.setStatus)
  const update = useMutation(api.applications.update)
  const addNote = useMutation(api.applications.addNote)
  const mail = useQuery(api.email.timeline)
  const answer = useMutation(api.email.resolveSuggestion)
  const file = useMutation(api.email.assign)
  const undo = useMutation(api.email.undoMove)
  const archive = useMutation(api.applications.archive)
  const trash = useMutation(api.applications.trash)
  const id = (s: string) => s as Id<"applications">
  const source: Source = {
    real: true,
    applications: (docs ?? []).map((d) => {
      const fit = fits.get(d._id)
      return { ...fromDoc(d), ...(fit && { fit: fit.fit, isFit: fit.isFit }) }
    }),
    goals: (goalDocs ?? []).map(
      ({ _id, name, summary, priority, start, target, milestones, loopId }) => ({
        id: _id,
        name,
        summary,
        priority,
        start,
        target,
        milestones,
        loopId,
      })
    ),
    loaded: docs !== undefined && goalDocs !== undefined,
    setStatus: (s, status) => void setStatus({ id: id(s), status }),
    update: (s, patch) => void update({ id: id(s), ...patch }),
    addNote: (s, text) => void addNote({ id: id(s), text }),
    setGoal: (s, goalId) => void setGoal({ id: id(s), goalId: goalId as Id<"goals"> | undefined }),
    mail: mail ?? [],
    answerMail: (eventId, accept) => void answer({ eventId, accept }),
    fileMail: (eventId, s) => void file({ eventId, applicationId: id(s) }),
    undoMove: (eventId) => void undo({ eventId }),
    archive: (s, archived) => void archive({ id: id(s), archived }),
    trash: (s) => void trash({ id: id(s) }),
  }
  return <SourceContext value={source}>{children}</SourceContext>
}
