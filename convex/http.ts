import { httpRouter } from "convex/server"
import { receive } from "./features/email/inbound"
import { mcp } from "./mcp"

const http = httpRouter()

http.route({ pathPrefix: "/email/inbound/", method: "POST", handler: receive })

mcp.registerRoutes(http)

export default http
