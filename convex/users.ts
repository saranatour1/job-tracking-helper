// Registers `api.users.*`. Definitions live in ./api/features/users.
import { usersApi } from "./api/features/users"

export const {
  me,
  updateProfile,
  generateUploadUrl,
  setImage,
  deleteAccount,
  preferences,
  savePreferences,
  skipPreferences,
  setResume,
} = usersApi
