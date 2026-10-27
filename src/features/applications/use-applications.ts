import { useForm } from "@tanstack/react-form"
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table"
import { type } from "arktype"
import { useState } from "react"

export const statuses = ["applied", "interviewing", "offer", "rejected"] as const

export const Application = type({
  company: "string > 0",
  role: "string > 0",
  status: type.enumerated(...statuses),
})
export type Application = typeof Application.infer

const features = tableFeatures({})
const helper = createColumnHelper<typeof features, Application>()
const columns = helper.columns([
  helper.accessor("company", { header: "Company" }),
  helper.accessor("role", { header: "Role" }),
  helper.accessor("status", { header: "Status" }),
])

const sample: Application[] = [
  { company: "Linear", role: "Product Engineer", status: "interviewing" },
  { company: "Vercel", role: "Frontend Engineer", status: "applied" },
]

const emptyApplication: Application = { company: "", role: "", status: "applied" }

// ponytail: rows live in React state until applications get a Convex table.
export const useApplications = () => {
  const [data, setData] = useState(sample)
  const table = useTable({ features, columns, data })
  const form = useForm({
    defaultValues: emptyApplication,
    validators: { onSubmit: Application },
    onSubmit: ({ value, formApi }) => {
      setData((rows) => [...rows, value])
      formApi.reset()
    },
  })
  return { table, form }
}
