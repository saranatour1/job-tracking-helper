import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../../lib/ark"
import { JudgedRead } from "../validators"

export const judgedReadsTable = defineTable(arkOutputToConvex(JudgedRead))
