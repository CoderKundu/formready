import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { inspectPdf, mergePdfPages } from './pdf'

// Makes a PDF whose pages have the given widths, so tests can tell pages
// apart after merging by their width.
async function makePdf(widths: number[]): Promise<Blob> {
  const doc = await PDFDocument.create()
  for (const width of widths) doc.addPage([width, 800])
  const bytes = await doc.save()
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
}

async function pageWidths(blob: Blob): Promise<number[]> {
  const doc = await PDFDocument.load(await blob.arrayBuffer())
  return doc.getPages().map((page) => page.getWidth())
}

describe('inspectPdf', () => {
  it('counts pages', async () => {
    expect(await inspectPdf(await makePdf([100, 200, 300]))).toEqual({ pageCount: 3 })
  })

  it('rejects a file that is not a PDF with a readable message', async () => {
    const notPdf = new Blob(['hello'], { type: 'text/plain' })
    await expect(inspectPdf(notPdf, 'marks.pdf')).rejects.toThrow('marks.pdf is not a readable PDF.')
  })
})

describe('mergePdfPages', () => {
  it('merges pages from several files in the requested order', async () => {
    const first = await makePdf([101, 102])
    const second = await makePdf([201, 202, 203])

    const merged = await mergePdfPages(
      [first, second],
      [
        { source: 1, page: 2 },
        { source: 0, page: 0 },
        { source: 1, page: 0 },
        { source: 0, page: 1 },
      ],
    )

    expect(merged.type).toBe('application/pdf')
    expect(await pageWidths(merged)).toEqual([203, 101, 201, 102])
  })

  it('leaves out pages that are not listed', async () => {
    const merged = await mergePdfPages([await makePdf([101, 102, 103])], [{ source: 0, page: 1 }])
    expect(await pageWidths(merged)).toEqual([102])
  })

  it('can repeat a page', async () => {
    const source = await makePdf([101])
    const merged = await mergePdfPages(
      [source],
      [
        { source: 0, page: 0 },
        { source: 0, page: 0 },
      ],
    )
    expect(await pageWidths(merged)).toEqual([101, 101])
  })

  it('marks FormReady as the producer', async () => {
    const merged = await mergePdfPages([await makePdf([101])], [{ source: 0, page: 0 }])
    const doc = await PDFDocument.load(await merged.arrayBuffer(), { updateMetadata: false })
    expect(doc.getProducer()).toBe('FormReady')
  })

  it('rejects an empty page list', async () => {
    await expect(mergePdfPages([await makePdf([101])], [])).rejects.toThrow('at least one page')
  })

  it('rejects a page number past the end, naming the file', async () => {
    await expect(
      mergePdfPages([await makePdf([101])], [{ source: 0, page: 1 }], ['marks.pdf']),
    ).rejects.toThrow('marks.pdf has no page 2.')
  })

  it('rejects a missing source file', async () => {
    await expect(mergePdfPages([await makePdf([101])], [{ source: 1, page: 0 }])).rejects.toThrow(
      'file 2',
    )
  })
})
