import { EncryptedPDFError, PDFDocument } from 'pdf-lib'

// PDF work done in the processing worker with pdf-lib. Kept in its own
// module so tests can run it without a worker.

export interface PdfInfo {
  pageCount: number
}

// One page in the merged output: which input file it comes from and which
// page of that file (both counted from 0).
export interface PageRef {
  source: number
  page: number
}

async function load(blob: Blob, label: string): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(await blob.arrayBuffer(), { updateMetadata: false })
  } catch (error) {
    if (error instanceof EncryptedPDFError) {
      throw new Error(
        `${label} is password-protected or encrypted. Remove the protection, or print it to a new PDF, and try again.`,
        { cause: error },
      )
    }
    throw new Error(`${label} is not a readable PDF.`, { cause: error })
  }
}

export async function inspectPdf(blob: Blob, label = 'This file'): Promise<PdfInfo> {
  const doc = await load(blob, label)
  return { pageCount: doc.getPageCount() }
}

// Builds one PDF from the given pages, in the given order. A page can come
// from any input file, so this covers merging, reordering and removing pages.
export async function mergePdfPages(
  sources: Blob[],
  pages: PageRef[],
  labels: string[] = [],
): Promise<Blob> {
  if (pages.length === 0) {
    throw new Error('Choose at least one page to merge.')
  }

  const docs = await Promise.all(
    sources.map((blob, index) => load(blob, labels[index] ?? `File ${index + 1}`)),
  )

  const output = await PDFDocument.create()
  output.setProducer('FormReady')
  output.setCreator('FormReady')

  for (const ref of pages) {
    const doc = docs[ref.source]
    if (!doc) {
      throw new Error(`Page refers to file ${ref.source + 1}, which was not provided.`)
    }
    if (!Number.isInteger(ref.page) || ref.page < 0 || ref.page >= doc.getPageCount()) {
      throw new Error(
        `${labels[ref.source] ?? `File ${ref.source + 1}`} has no page ${ref.page + 1}.`,
      )
    }
    const [copied] = await output.copyPages(doc, [ref.page])
    output.addPage(copied)
  }

  const bytes = await output.save({ useObjectStreams: true })
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
}
