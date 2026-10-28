import { PreferencesDraft, workModes } from "@convex/api/features/users/validators"
import { type } from "arktype"

// The prompt someone pastes into their own AI assistant. The assistant interviews
// them and replies with JSON in the form's shape, which the form then fills in from.
export const assistantPrompt = `You're helping me fill in my job-search preferences in Job Tracking Helper. I don't want to describe myself with a resume, so ask me questions instead of guessing.

How to work:
1. Ask one short question at a time, 12 at most. If I've pasted notes, a LinkedIn summary or old cover letters, use them and only ask about what's missing.
2. Keep my own words. Tags are 1 to 4 words each.
3. When we're done, reply with only a JSON object in exactly this shape and no other text. Use "" or [] for anything I didn't answer.

{
  "interests": ["work, topics or problems I want more of"],
  "avoid": ["things I'd rather not do again"],
  "growthGoal": "where I want to be, and what I think is in the way",
  "skillsToBuild": ["skills I want to build"],
  "locations": ["cities, countries or regions I'd work in"],
  "workMode": "one of: ${workModes.join(", ")}",
  "companies": ["companies I'd love to work for"],
  "companyTraits": "what draws me to a company: culture, how they work, things they've achieved",
  "redFlagCompanies": ["companies I'd avoid"],
  "redFlags": "what's a red flag for me in a company or a job post",
  "identity": "who I am as a person, not as a candidate",
  "answers": {
    "offer": "what would make me say yes to an offer on the spot",
    "leave": "what would make me leave a job in the first six months",
    "goodWeek": "what a good week at work looks like",
    "pay": "the lowest pay I'd accept, with the currency",
    "visa": "whether I need a visa or work permit, and where",
    "start": "when I could start"
  }
}`

// Reads an assistant's reply: finds the JSON object (assistants often wrap it in a
// code fence or a sentence), then checks it against the form's shape.
export const parseReply = (reply: string) => {
  const start = reply.indexOf("{")
  const end = reply.lastIndexOf("}")
  if (start === -1 || end <= start)
    return { error: "There's no JSON in that reply. Copy the assistant's whole reply." }
  let data: unknown
  try {
    data = JSON.parse(reply.slice(start, end + 1))
  } catch {
    return { error: "That reply isn't valid JSON. Ask the assistant to send only the JSON." }
  }
  const draft = PreferencesDraft(data)
  if (draft instanceof type.errors) return { error: draft.summary }
  return { draft }
}
