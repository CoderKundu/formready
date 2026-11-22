import { lazy, Suspense } from 'react'
import ExamFlow from './flow/ExamFlow'

// Loaded on demand: PDF.js and the drag-and-drop code are large, and most
// visitors will not open every tool.
const PdfMerger = lazy(() => import('./tools/PdfMerger'))

function App() {
  return (
    <main className="page">
      <header className="intro">
        <p className="eyebrow">FormReady</p>
        <h1>Exam-ready photos, signatures and PDFs</h1>
        <p className="lede">
          Turn a phone photo, a signature and a pile of marksheets into files
          that pass exam portal upload rules. Nothing is uploaded; everything
          runs on your device.
        </p>
      </header>

      <ExamFlow />

      <section className="tools" aria-labelledby="tools-heading">
        <h2 id="tools-heading" className="visually-hidden">
          Other tools
        </h2>
        <Suspense fallback={<p role="status">Loading the PDF tool…</p>}>
          <PdfMerger />
        </Suspense>
      </section>

      <footer className="footer">Free software under the AGPL-3.0 licence.</footer>
    </main>
  )
}

export default App
