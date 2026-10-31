import { createMiddleware, createStart } from "@tanstack/react-start"
import { setResponseHeaders } from "@tanstack/react-start/server"

const securityHeaders = new Headers({
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
})

const withSecurityHeaders = createMiddleware().server(({ next }) => {
  setResponseHeaders(securityHeaders)
  return next()
})

export const startInstance = createStart(() => ({ requestMiddleware: [withSecurityHeaders] }))
