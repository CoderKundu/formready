import { presets } from './presets'

const steps = [
  {
    title: 'Photo',
    detail: 'Crop to the face, resize to the portal’s size and bring it under the KB limit.',
  },
  {
    title: 'Signature',
    detail: 'Clean up a phone picture of your signature onto a white background.',
  },
  {
    title: 'Documents',
    detail: 'Merge marksheets into one PDF and compress it to the allowed size.',
  },
]

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
        <ul className="exams" aria-label="Exams planned for version 1">
          {presets.map((preset) => (
            <li key={preset.id} title={preset.body}>
              {preset.name}
            </li>
          ))}
        </ul>
      </header>

      <section aria-labelledby="steps-heading">
        <h2 id="steps-heading">Three steps</h2>
        <ol className="steps">
          {steps.map((step, index) => (
            <li key={step.title} className="step">
              <span className="step-number" aria-hidden="true">
                {index + 1}
              </span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <p className="status" role="status">
        In development. The tools are not available yet.
      </p>

      <footer className="footer">Free software under the AGPL-3.0 licence.</footer>
    </main>
  )
}

export default App
