import { httpRouter } from "convex/server"
import { httpAction } from "./_generated/server"
import { receive } from "./features/email/inbound"
import { botKeyDirectory } from "./lib/webBotAuth"
import { mcp } from "./mcp"

const http = httpRouter()

http.route({ pathPrefix: "/email/inbound/", method: "POST", handler: receive })

http.route({
  path: "/.well-known/http-message-signatures-directory",
  method: "GET",
  handler: httpAction(botKeyDirectory),
})

mcp.registerRoutes(http)

export default http
