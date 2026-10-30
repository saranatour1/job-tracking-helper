import * as pdfjs from "pdfjs-dist"
import type { PDFDocumentProxy } from "pdfjs-dist"
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import { Suspense, use } from "react"

// Draws a PDF page by page on canvases with pdf.js, the engine Firefox uses. The file
// is fetched from its signed storage link into this page and parsed in a worker shipped
// with the app; nothing in the PDF runs (no scripting, no XFA forms, no annotation
// layer, and pdf.js 6 has no eval), and the file never goes to another service. Preferred over an iframe, which
// would hand the file to the browser's plugin.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

// One load per link, shared across renders; the link changes when the file does.
const documents = new Map<string, Promise<PDFDocumentProxy>>()
const documentOf = (url: string) => {
  let loading = documents.get(url)
  if (!loading) {
    loading = pdfjs.getDocument({ url, enableXfa: false, disableAutoFetch: true }).promise
    documents.set(url, loading)
  }
  return loading
}

// Rendered once per canvas; a re-render leaves a drawn page alone.
const draw = async (canvas: HTMLCanvasElement, doc: PDFDocumentProxy, number: number) => {
  if (canvas.dataset.drawn) return
  canvas.dataset.drawn = "1"
  const page = await doc.getPage(number)
  // Fit the column, drawn at the screen's pixel density so text stays crisp.
  const scale = Math.min(2, window.devicePixelRatio || 1)
  // The list's width less its padding; the item itself shrinks to the canvas.
  const width = (canvas.closest("ol")?.clientWidth ?? 624) - 24
  const fit = width / page.getViewport({ scale: 1 }).width
  const viewport = page.getViewport({ scale: fit * scale })
  canvas.width = viewport.width
  canvas.height = viewport.height
  canvas.style.width = `${viewport.width / scale}px`
  canvas.style.height = `${viewport.height / scale}px`
  const context = canvas.getContext("2d")
  if (context) await page.render({ canvasContext: context, viewport, canvas }).promise
}

const Pages = ({ url }: { url: string }) => {
  const doc = use(documentOf(url))
  return (
    <ol className="flex flex-col items-center gap-3 p-3">
      {Array.from({ length: doc.numPages }, (_, i) => (
        <li key={i} className="max-w-full overflow-auto">
          <canvas
            ref={(canvas) => {
              if (canvas) void draw(canvas, doc, i + 1)
            }}
            aria-label={`Page ${i + 1} of ${doc.numPages}`}
            className="bg-white shadow-sm"
          />
        </li>
      ))}
    </ol>
  )
}

/** The resume as it looks, for a PDF. */
export const PdfViewer = ({ url }: { url: string }) => (
  <Suspense
    fallback={<p className="text-muted-foreground p-3 text-center text-xs">Opening the PDF…</p>}
  >
    <Pages url={url} />
  </Suspense>
)
