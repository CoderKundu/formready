import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// PDF.js parses files in its own worker; the main thread only draws.
GlobalWorkerOptions.workerSrc = workerUrl

export type { PDFDocumentProxy }

export async function openPdf(blob: Blob): Promise<PDFDocumentProxy> {
  return getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise
}

// Frees the memory PDF.js holds for a document.
export function closePdf(doc: PDFDocumentProxy): void {
  void doc.loadingTask.destroy()
}

// Draws one page into the canvas, `width` CSS pixels wide. Resolves when
// done; cancel with the returned function (for example when the thumbnail
// unmounts).
export function renderPage(
  doc: PDFDocumentProxy,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  width: number,
): { done: Promise<void>; cancel: () => void } {
  let cancelled = false
  let cancelRender = () => {}

  const done = (async () => {
    const page = await doc.getPage(pageIndex + 1)
    if (cancelled) return
    const base = page.getViewport({ scale: 1 })
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    const viewport = page.getViewport({ scale: (width / base.width) * pixelRatio })

    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`

    const task = page.render({ canvas, viewport })
    cancelRender = () => task.cancel()
    try {
      await task.promise
    } catch (error) {
      if (!cancelled) throw error
    }
  })()

  return {
    done,
    cancel: () => {
      cancelled = true
      cancelRender()
    },
  }
}
