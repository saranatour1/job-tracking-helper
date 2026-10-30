// Registers `api.users.*`. Definitions live in ./features/users.
import { usersApi } from "./features/users"

export const { me, updateProfile, generateUploadUrl, setImage, deleteAccount } = usersApi
