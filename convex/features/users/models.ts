import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../lib/ark"
import { User } from "./validators"

export const usersTable = defineTable(arkOutputToConvex(User))
  .index("by_userName", ["userName"])
  .index("by_imageId", ["imageId"])
