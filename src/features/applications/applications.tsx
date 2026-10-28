import { api } from "@convex/_generated/api"
import type { Doc } from "@convex/_generated/dataModel"
import { Application, statuses } from "@convex/api/features/applications/validators"
import { useForm } from "@tanstack/react-form"
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table"
import { useMutation, useQuery } from "convex/react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageIntro, pageBody, Tile } from "@/features/shell/page-body"
import { PageHeader } from "@/features/shell/page-header"

const features = tableFeatures({})
const helper = createColumnHelper<typeof features, Doc<"applications">>()
const columns = helper.columns([
  helper.accessor("company", { header: "Company" }),
  helper.accessor("role", { header: "Role" }),
  helper.accessor("status", {
    header: "Status",
    cell: (cell) => <span className="capitalize">{cell.getValue()}</span>,
  }),
])

const statusItems = statuses.map((status) => ({ value: status, label: status }))

const emptyApplication: typeof Application.inferIn = { company: "", role: "", status: "applied" }
const noRows: Doc<"applications">[] = []

export const Applications = () => {
  const rows = useQuery(api.applications.list)
  const add = useMutation(api.applications.add)
  const table = useTable({ features, columns, data: rows ?? noRows })
  const form = useForm({
    defaultValues: emptyApplication,
    validators: { onSubmit: Application },
    // Re-check on every save; otherwise one failed save blocks the next even once fixed.
    canSubmitWhenInvalid: true,
    onSubmit: async ({ value, formApi }) => {
      await add(value)
      formApi.reset()
    },
  })

  return (
    <>
      <PageHeader crumbs={[{ label: "Applications" }]} />
      <main className={pageBody}>
        <PageIntro
          title="Applications"
          description="Every role you've applied to, and where it stands."
        />
        <Tile title="Add an application" className="gap-3">
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
                  <Select
                    value={field.state.value}
                    items={statusItems}
                    onValueChange={(v) => v && field.handleChange(v)}
                  >
                    <SelectTrigger id="status" className="w-36 capitalize">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      {statusItems.map((s) => (
                        <SelectItem key={s.value} value={s.value} className="capitalize">
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </div>
              )}
            </form.Field>
            <Button type="submit">Add</Button>
          </form>
        </Tile>

        <Tile title="Your applications">
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
        </Tile>
      </main>
    </>
  )
}
