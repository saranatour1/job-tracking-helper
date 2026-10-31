import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../lib/ark"
import { DeleteJob } from "./validators"

export const deleteJobsTable = defineTable(arkOutputToConvex(DeleteJob))
