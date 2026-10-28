import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

// shortcut: the create buttons do nothing until the tracker is connected to Convex.
export const NewApplicationDialog = ({ trigger }: { trigger: React.ReactElement }) => (
  <Dialog>
    <DialogTrigger render={trigger} />
    <DialogPopup className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>New application</DialogTitle>
        <DialogDescription>Add a role you saved or applied to.</DialogDescription>
      </DialogHeader>
      <DialogPanel className="grid gap-4">
        {(
          [
            ["role", "Role", "Frontend Engineer"],
            ["company", "Company", "Stripe"],
            ["url", "Posting link", "https://"],
          ] as const
        ).map(([id, label, placeholder]) => (
          <div key={id} className="grid gap-1.5">
            <Label htmlFor={`new-${id}`}>{label}</Label>
            <Input id={`new-${id}`} placeholder={placeholder} />
          </div>
        ))}
        <div className="grid gap-1.5">
          <Label htmlFor="new-notes">Notes</Label>
          <Textarea id="new-notes" placeholder="Anything to remember about this role…" />
        </div>
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button type="button">Create application</Button>
      </DialogFooter>
    </DialogPopup>
  </Dialog>
)
