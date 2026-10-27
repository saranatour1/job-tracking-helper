import { v } from "convex/values"
import { query } from "../../_generated/server"

// scripts/dev.sh sets "disabled" so dev can push without real OAuth apps.
const configured = (...names: string[]): boolean =>
  names.every((name) => ![undefined, "", "disabled"].includes(process.env[name]))

const oauthProviders = query({
  args: {},
  returns: v.object({ google: v.boolean(), github: v.boolean() }),
  handler: () => ({
    google: configured("AUTH_GOOGLE_CLIENT_ID", "AUTH_GOOGLE_CLIENT_SECRET"),
    github: configured("AUTH_GITHUB_CLIENT_ID", "AUTH_GITHUB_CLIENT_SECRET"),
  }),
})

export const providersApi = { oauthProviders }
