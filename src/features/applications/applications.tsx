import { api } from "@convex/_generated/api"
import type { Doc } from "@convex/_generated/dataModel"
import { Application, statuses } from "@convex/api/features/applications/validators"
import { useForm } from "@tanstack/react-form"
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table"
import { useMutation } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"

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
import { MailCell, UnsortedMail } from "@/features/applications/mail"
import { PageHeader } from "@/features/shell/page-header"

const features = tableFeatures({})
const helper = createColumnHelper<typeof features, Doc<"applications">>()
const columns = helper.columns([
  helper.accessor("company", { header: "Company" }),
  helper.accessor("role", { header: "Role" }),
  helper.accessor("status", { header: "Status" }),
  helper.display({
    id: "mail",
    header: "Mail",
    cell: ({ row }) => <MailCell applicationId={row.original._id} />,
  }),
])

const emptyApplication: typeof Application.inferIn = { company: "", role: "", status: "applied" }
const noRows: Doc<"applications">[] = []

export const Applications = () => {
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

  return (
    <>
      <PageHeader crumbs={[{ label: "Applications" }]} />
      <main className="flex flex-col gap-6 p-6">
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
                  onChange={(e) => field.handleChange(e.target.value as (typeof statuses)[number])}
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

        <UnsortedMail applications={rows ?? noRows} />

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
    </>
  )
}
