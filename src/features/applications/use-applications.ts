import { useForm } from "@tanstack/react-form"
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table"
import { useMutation, useQuery } from "convex/react"

import { api } from "../../../convex/_generated/api"
import type { Doc } from "../../../convex/_generated/dataModel"
import { Application } from "../../../convex/api/features/applications/validators"

export { statuses } from "../../../convex/api/features/applications/validators"

const features = tableFeatures({})
const helper = createColumnHelper<typeof features, Doc<"applications">>()
const columns = helper.columns([
  helper.accessor("company", { header: "Company" }),
  helper.accessor("role", { header: "Role" }),
  helper.accessor("status", { header: "Status" }),
])

const emptyApplication: typeof Application.inferIn = { company: "", role: "", status: "applied" }
const noRows: Doc<"applications">[] = []

export const useApplications = () => {
  const rows = useQuery(api.applications.list)
  const add = useMutation(api.applications.add)
  const table = useTable({ features, columns, data: rows ?? noRows })
  const form = useForm({
    defaultValues: emptyApplication,
    validators: { onSubmit: Application },
    onSubmit: async ({ value, formApi }) => {
      await add(value)
      formApi.reset()
    },
  })
  return { table, form }
}
