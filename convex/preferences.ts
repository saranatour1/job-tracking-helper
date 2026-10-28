// Registers `api.preferences.*`. Definitions live in ./api/features/preferences.
import { preferencesApi } from "./api/features/preferences"

export const { get, save, savePrefilled, skip, setResume } = preferencesApi
