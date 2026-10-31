// Registers `api.api.contacts.*` and `internal.api.contacts.*`. Definitions live in
// ../features/contacts.
import { contactsApi } from "../features/contacts"

export const {
  list,
  known,
  save,
  remove,
  learnContext,
  learn,
  learned,
  store,
  contactsPage,
  resealContact,
} = contactsApi
