// Registers `api.contacts.*` and `internal.contacts.*`. Definitions live in
// ./features/contacts.
import { contactsApi } from "./features/contacts"

export const {
  list,
  save,
  remove,
  learnContext,
  learn,
  learned,
  store,
  contactsPage,
  resealContact,
} = contactsApi
