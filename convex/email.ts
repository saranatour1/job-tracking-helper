// Registers `api.email.*` and `internal.email.*`. Definitions live in ./api/features/email.
import { emailApi } from "./api/features/email"

export const {
  connection,
  connect,
  disconnect,
  setAllow,
  sendTest,
  save,
  sealed,
  connectionsPage,
  resealConnection,
  resealAll,
  removeEmails,
} = emailApi
