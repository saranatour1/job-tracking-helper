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
import type { Application } from "../../../convex/features/applications/validators"
import { statuses, useApplications } from "./use-applications"

export const Applications = () => {
  const { table, form } = useApplications()

  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="font-heading text-lg font-medium">Applications</h1>

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
