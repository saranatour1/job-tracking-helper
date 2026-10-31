import { EditorContent, useEditor, useEditorState } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { useImperativeHandle, type Ref } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type EditorHandle = {
  html: () => string
  text: () => string
  isEmpty: () => boolean
  setHtml: (html: string) => void
}

// Loaded only when something opens it, since this is the app's heaviest piece.
const MailEditor = ({
  initialHtml = "",
  handle,
  label,
}: {
  initialHtml?: string
  handle: Ref<EditorHandle>
  label: string
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, protocols: ["https", "mailto"] },
      }),
    ],
    content: initialHtml,
    // The page is drawn on the server first, and the editor only exists in the browser.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": label,
        class: "min-h-48 p-3 text-[13px] leading-relaxed outline-none",
      },
    },
  })
  useImperativeHandle(
    handle,
    () => ({
      html: () => editor?.getHTML() ?? "",
      text: () => editor?.getText({ blockSeparator: "\n\n" }) ?? "",
      isEmpty: () => editor?.isEmpty ?? true,
      setHtml: (html) => editor?.commands.setContent(html),
    }),
    [editor]
  )
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      underline: e?.isActive("underline") ?? false,
      bullets: e?.isActive("bulletList") ?? false,
      numbers: e?.isActive("orderedList") ?? false,
      link: e?.isActive("link") ?? false,
    }),
  })
  const tool = (name: string, on: boolean | undefined, run: () => void) => (
    <Button
      key={name}
      type="button"
      size="xs"
      variant="ghost"
      aria-pressed={on ?? false}
      className={cn(on && "bg-accent")}
      onClick={run}
    >
      {name}
    </Button>
  )
  const chain = () => editor?.chain().focus()
  return (
    <div className="[&_.ProseMirror_a]:text-primary rounded-lg border [&_.ProseMirror_a]:underline [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:ps-5 [&_.ProseMirror_p]:my-1.5 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:ps-5">
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-0.5 border-b p-1">
        {tool("Bold", active?.bold, () => chain()?.toggleBold().run())}
        {tool("Italic", active?.italic, () => chain()?.toggleItalic().run())}
        {tool("Underline", active?.underline, () => chain()?.toggleUnderline().run())}
        {tool("Bullets", active?.bullets, () => chain()?.toggleBulletList().run())}
        {tool("Numbers", active?.numbers, () => chain()?.toggleOrderedList().run())}
        {tool("Link", active?.link, () => {
          if (active?.link) return void chain()?.unsetLink().run()
          const href = window.prompt("Link to")?.trim()
          if (href)
            chain()
              ?.setLink({ href: /^(https|mailto):/i.test(href) ? href : `https://${href}` })
              .run()
        })}
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

export default MailEditor
