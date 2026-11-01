import { vDraft } from "@convex/features/automations/validators"
import { validate } from "convex-helpers/validators"

import { type Draft, type TemplateName, templates } from "./templates"

// `template` and `loop` only matter for a new workflow: what it starts as. A top-level
// step's place is a number in the address, so it reads ?step=2: the router quotes
// strings that look like numbers.
export type WorkflowSearch = {
  step?: string | number
  tab?: "history"
  run?: string
  template?: TemplateName
  loop?: string
  draft?: Draft
}
export const workflowSearch = (search: Record<string, unknown>): WorkflowSearch => ({
  step:
    typeof search.step === "string" || typeof search.step === "number" ? search.step : undefined,
  tab: search.tab === "history" ? "history" : undefined,
  run: typeof search.run === "string" ? search.run : undefined,
  template:
    typeof search.template === "string" && search.template in templates
      ? (search.template as TemplateName)
      : undefined,
  loop: typeof search.loop === "string" ? search.loop : undefined,
  draft: validate(vDraft, search.draft) ? (search.draft as Draft) : undefined,
})
