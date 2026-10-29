// Registers `api.email.*` and `internal.email.*`. Definitions live in ./api/features/email.
import { emailApi } from "./api/features/email"

export const {
  connection,
  connect,
  setAllow,
  sendTest,
  setUpInbound,
  stopInbound,
  disconnect,
  recentMail,
  timeline,
  resolveSuggestion,
  assign,
  sortContext,
  record,
  sortMail,
  save,
  sealed,
  setInbound,
  inboundTarget,
  remove,
  connectionsPage,
  resealConnection,
  resealAll,
  removeEmails,
} = emailApi
