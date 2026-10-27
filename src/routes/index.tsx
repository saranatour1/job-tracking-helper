import { useForm } from "@tanstack/react-form"
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table"
import { createFileRoute } from "@tanstack/react-router"
import { type } from "arktype"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const statuses = ["applied", "interviewing", "offer", "rejected"] as const

const Application = type({
  company: "string > 0",
  role: "string > 0",
  status: type.enumerated(...statuses),
})
type Application = typeof Application.infer

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

const emptyApplication: Application = {
  company: "",
  role: "",
  status: "applied",
}

export const Route = createFileRoute("/")({ component: Applications })

function Applications() {
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

  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="text-lg font-medium">Applications</h1>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        {(["company", "role"] as const).map((name) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <div className="grid gap-1.5">
                <Label htmlFor={name} className="capitalize">
                  {name}
                </Label>
                <Input
                  id={name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-destructive text-xs">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        ))}
        <form.Field name="status">
          {(field) => (
            <div className="grid gap-1.5">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value as Application["status"])}
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          )}
        </form.Field>
        <Button type="submit">Add</Button>
      </form>

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id}>
                  <table.FlexRender header={header} />
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </main>
  )
}
