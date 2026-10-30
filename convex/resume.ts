"use node"
// Registers `api.resume.*`: the Node action that parses a resume. Definitions live in
// ./api/features/preferences/resume.ts; the rest of preferences stays in the default runtime.
import { resumeActions } from "./api/features/preferences/resume"

export const { review } = resumeActions
