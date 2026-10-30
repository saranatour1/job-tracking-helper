import { httpRouter } from "convex/server"
import { receive } from "./features/email/inbound"

const http = httpRouter()

// Each person's Cloudflare Worker posts their incoming mail to /email/inbound/<id>.
http.route({ pathPrefix: "/email/inbound/", method: "POST", handler: receive })

export default http
