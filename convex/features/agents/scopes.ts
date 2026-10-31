// What a connected agent can be allowed to do. Apart from the server so the Account page can
// read it without loading the tools.
export const agentScopes = {
  "preferences:read": "See your job preferences and standing answers",
  "preferences:write":
    "Change your job preferences. New answers stay off forms until you save them",
  "jobs:read": "See open roles, your shortlist and your loops",
  "jobs:write": "Respond to roles, check links, and design and run your loops",
  "applications:read": "See the applications prepared for you and their answers",
  "applications:write": "Prepare applications and draft answers. You still submit them yourself",
  "board:read": "See your goals and board views",
  "board:write": "Add and change your goals and board views",
  "contacts:read": "See your contacts",
  "contacts:write": "Add contacts",
  "workflows:read": "See your workflows",
  "workflows:write": "Draft and replace workflows. Each one stays off until you read and save it",
  "notifications:write": "Send you messages in Updates",
} as const

export const readOnlyScopes = Object.keys(agentScopes).filter((s) => s.endsWith(":read"))
