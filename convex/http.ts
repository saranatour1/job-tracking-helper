import { httpRouter } from "convex/server"
import { receive } from "./features/email/inbound"

const http = httpRouter()

http.route({ pathPrefix: "/email/inbound/", method: "POST", handler: receive })

export default http
