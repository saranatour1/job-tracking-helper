import { api } from "@/lib/api"
import type { Doc, Id } from "@convex/_generated/dataModel"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { useQuery } from "convex-helpers/react/cache/hooks"
import { createContext, useContext } from "react"

import type { MailEvent } from "./mail"
import {
  type Application,
  type ApplicationCard,
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
  applications: ApplicationCard[]
  goals: Goal[]
  // False while the first load is on its way.
  loaded: boolean
  setStatus: (id: string, status: Status) => void
  update: (id: string, patch: Partial<Editable>) => void
  addNote: (id: string, text: string) => void
  setGoal: (id: string, goalId?: string) => void
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
    applications: applications.map((a) => ({
      ...a,
      code: a.id,
      lastNoteAt: a.notes?.at(-1)?.at,
    })),
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
const cardFromDoc = (d: FunctionReturnType<typeof api.applications.list>[number]) =>
  ({
    id: d._id,
    code: `APP-${d.number}`,
    role: d.role,
    company: d.company,
    status: d.status,
    priority: d.priority ?? "none",
    // Labels are free text here; the sample list only seeds the label picker.
    labels: (d.labels ?? []) as Label[],
    method: d.method ?? "Company site",
    location: d.location ?? "",
    createdAt: isoOf(d._creationTime),
    url: d.url,
    history: d.history.map((e) => ({
      status: e.status,
      at: isoOf(e.at),
      ...(e.note && { note: e.note }),
    })),
    tasks: d.tasks,
    goalId: d.goalId,
    ...(d.lastNoteAt !== undefined && { lastNoteAt: isoOf(d.lastNoteAt) }),
    ...(d.mail && { mail: d.mail }),
    ...(d.fit !== undefined && { fit: d.fit, isFit: d.isFit }),
    ...(d.archivedAt !== undefined && { archived: true }),
  }) satisfies ApplicationCard

export const fromDoc = (d: Doc<"applications">): Application => {
  const notes = d.notes?.map((n) => ({ text: n.text, at: isoOf(n.at) }))
  return {
    ...cardFromDoc(d),
    description: d.description ?? "",
    notes,
    lastNoteAt: notes?.at(-1)?.at,
  }
}

/** One whole application, from its text in a route or its id. Undefined while it loads, and
 * null when it isn't there. */
export const useApplication = (ref: string): Application | null | undefined => {
  const { real } = useSource()
  const sample = useApplications().find((a) => a.id === ref)
  const doc = useQuery(api.applications.get, real ? { ref } : "skip")
  if (!real) return sample ? { ...sample, code: sample.id } : null
  return doc && fromDoc(doc)
}

export const ConvexSource = ({ children }: { children: React.ReactNode }) => {
  const docs = useQuery(api.applications.list)
  const goalDocs = useQuery(api.goals.list)
  const setGoal = useMutation(api.applications.setGoal)
  const setStatus = useMutation(api.applications.setStatus)
  const update = useMutation(api.applications.update)
  const addNote = useMutation(api.applications.addNote)
  const answer = useMutation(api.email.resolveSuggestion)
  const file = useMutation(api.email.assign)
  const undo = useMutation(api.email.undoMove)
  const archive = useMutation(api.applications.archive)
  const trash = useMutation(api.applications.trash)
  const id = (s: string) => s as Id<"applications">
  const source: Source = {
    real: true,
    applications: (docs ?? []).map(cardFromDoc),
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
    answerMail: (eventId, accept) => void answer({ eventId, accept }),
    fileMail: (eventId, s) => void file({ eventId, applicationId: id(s) }),
    undoMove: (eventId) => void undo({ eventId }),
    archive: (s, archived) => void archive({ id: id(s), archived }),
    trash: (s) => void trash({ id: id(s) }),
  }
  return <SourceContext value={source}>{children}</SourceContext>
}
