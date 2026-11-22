import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { closePdf, openPdf, renderPage, type PDFDocumentProxy } from '../pdf/pdfjs'
import { getProcessor } from '../workers/client'
import './PdfMerger.css'

interface SourceFile {
  id: string
  name: string
  blob: Blob
  doc: PDFDocumentProxy
}

interface PageItem {
  id: string
  fileId: string
  pageIndex: number
}

interface MergeResult {
  url: string
  kilobytes: number
  pageCount: number
}

const THUMB_WIDTH = 112

let nextId = 0
const newId = (prefix: string) => `${prefix}-${++nextId}`

export default function PdfMerger() {
  const [files, setFiles] = useState<SourceFile[]>([])
  const [pages, setPages] = useState<PageItem[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState<'adding' | 'merging' | null>(null)
  const [result, setResult] = useState<MergeResult | null>(null)
  const inputId = useId()

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // A short press before dragging, so a swipe still scrolls the page on phones.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Free the download link and the parsed documents when they are replaced.
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url) }, [result])
  const filesRef = useRef(files)
  useEffect(() => {
    filesRef.current = files
  }, [files])
  useEffect(() => () => filesRef.current.forEach((file) => closePdf(file.doc)), [])

  const clearResult = () => setResult(null)

  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (chosen.length === 0) return

    setBusy('adding')
    setErrors([])
    clearResult()
    const processor = getProcessor()
    const added: SourceFile[] = []
    const addedPages: PageItem[] = []
    const problems: string[] = []

    for (const file of chosen) {
      try {
        // pdf-lib does the merge, so check the file with it first: PDF.js can
        // display some files (such as encrypted ones) that pdf-lib cannot merge.
        const { pageCount } = await processor.inspectPdf(file, file.name)
        const doc = await openPdf(file)
        const source: SourceFile = { id: newId('file'), name: file.name, blob: file, doc }
        added.push(source)
        for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
          addedPages.push({ id: newId('page'), fileId: source.id, pageIndex })
        }
      } catch (error) {
        problems.push(error instanceof Error ? error.message : `${file.name} could not be read.`)
      }
    }

    setFiles((current) => [...current, ...added])
    setPages((current) => [...current, ...addedPages])
    setErrors(problems)
    setBusy(null)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    setPages((current) => {
      const from = current.findIndex((page) => page.id === active.id)
      const to = current.findIndex((page) => page.id === over.id)
      return arrayMove(current, from, to)
    })
    clearResult()
  }

  function removePage(id: string) {
    setPages((current) => current.filter((page) => page.id !== id))
    clearResult()
  }

  function clearAll() {
    files.forEach((file) => closePdf(file.doc))
    setFiles([])
    setPages([])
    setErrors([])
    clearResult()
  }

  async function merge() {
    setBusy('merging')
    setErrors([])
    clearResult()
    try {
      // Send only the files that still have pages in the list.
      const used = files.filter((file) => pages.some((page) => page.fileId === file.id))
      const sourceIndex = new Map(used.map((file, index) => [file.id, index]))
      const processor = getProcessor()
      const merged = await processor.mergePdfPages(
        used.map((file) => file.blob),
        pages.map((page) => ({ source: sourceIndex.get(page.fileId)!, page: page.pageIndex })),
        used.map((file) => file.name),
      )
      const { kilobytes } = await processor.describeBlob(merged)
      setResult({ url: URL.createObjectURL(merged), kilobytes, pageCount: pages.length })
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'The PDFs could not be merged.'])
    } finally {
      setBusy(null)
    }
  }

  const fileById = new Map(files.map((file) => [file.id, file]))
  const fileNumber = new Map(files.map((file, index) => [file.id, index + 1]))

  return (
    <section className="merger" aria-labelledby="merger-heading">
      <h2 id="merger-heading">Merge PDFs</h2>
      <p className="merger-intro">
        Add your marksheets and certificates, drag the pages into order, remove the ones you
        don’t need, then merge them into one PDF. Files stay on your device.
      </p>

      <div className="merger-actions">
        <label className="button" htmlFor={inputId} aria-disabled={busy !== null}>
          {files.length === 0 ? 'Choose PDFs' : 'Add more PDFs'}
        </label>
        <input
          id={inputId}
          className="visually-hidden"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          disabled={busy !== null}
          onChange={addFiles}
        />
        {pages.length > 0 && (
          <button type="button" className="button button-quiet" onClick={clearAll} disabled={busy !== null}>
            Start over
          </button>
        )}
      </div>

      <p className="merger-status" role="status">
        {busy === 'adding' && 'Reading files…'}
        {busy === 'merging' && 'Merging…'}
      </p>

      {errors.length > 0 && (
        <ul className="merger-errors" role="alert">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      {pages.length > 0 && (
        <>
          <p className="merger-hint" id="merger-hint">
            {pages.length} {pages.length === 1 ? 'page' : 'pages'}. Drag to reorder; on a phone,
            press and hold first. With a keyboard, focus a page and press Space to pick it up,
            then use the arrow keys.
          </p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={pages.map((page) => page.id)} strategy={rectSortingStrategy}>
              <ol className="page-grid" aria-describedby="merger-hint">
                {pages.map((page, position) => {
                  const file = fileById.get(page.fileId)!
                  return (
                    <SortablePage
                      key={page.id}
                      page={page}
                      position={position + 1}
                      doc={file.doc}
                      label={`${file.name}, page ${page.pageIndex + 1}`}
                      badge={files.length > 1 ? `${fileNumber.get(file.id)}·${page.pageIndex + 1}` : `${page.pageIndex + 1}`}
                      onRemove={removePage}
                      disabled={busy !== null}
                    />
                  )
                })}
              </ol>
            </SortableContext>
          </DndContext>

          <div className="merger-actions">
            <button type="button" className="button" onClick={merge} disabled={busy !== null}>
              Merge {pages.length} {pages.length === 1 ? 'page' : 'pages'}
            </button>
          </div>
        </>
      )}

      {result && (
        <div className="merger-result">
          <p>
            Merged PDF: {result.pageCount} {result.pageCount === 1 ? 'page' : 'pages'},{' '}
            {result.kilobytes} KB.
          </p>
          <a className="button" href={result.url} download="merged.pdf">
            Download merged.pdf
          </a>
        </div>
      )}
    </section>
  )
}

interface SortablePageProps {
  page: PageItem
  position: number
  doc: PDFDocumentProxy
  label: string
  badge: string
  onRemove: (id: string) => void
  disabled: boolean
}

function SortablePage({ page, position, doc, label, badge, onRemove, disabled }: SortablePageProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
    disabled,
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const render = renderPage(doc, page.pageIndex, canvas, THUMB_WIDTH)
    render.done.catch(() => setFailed(true))
    return render.cancel
  }, [doc, page.pageIndex])

  return (
    <li
      ref={setNodeRef}
      className={`page-card${isDragging ? ' is-dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-label={`Position ${position}: ${label}`}
    >
      <div className="page-thumb">
        <canvas ref={canvasRef} aria-hidden="true" />
        {failed && <span className="page-thumb-failed">No preview</span>}
      </div>
      <div className="page-meta">
        <span className="page-badge" title={label}>{badge}</span>
        <button
          type="button"
          className="page-remove"
          aria-label={`Remove ${label}`}
          onClick={() => onRemove(page.id)}
          // Keep Space and Enter on this button from picking up the card.
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          disabled={disabled}
        >
          ×
        </button>
      </div>
    </li>
  )
}
