// Registers `api.users.*`. Definitions live in ./api/features/users.
import { usersApi } from "./api/features/users"

export const { me, updateProfile, generateImageUploadUrl, setImage, deleteAccount } = usersApi
