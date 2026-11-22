import { useEffect, useRef, useState } from 'react'
import { getPreset, type Preset } from '../presets'
import ExamPicker from './ExamPicker'
import { STEP_ORDER, isStepId, stepsFor, type StepId } from './steps'
import UploadCard from './UploadCard'
import { initialUploadState, type UploadState } from './upload-state'
import './flow.css'

// The guided flow: pick an exam, then prepare the photo, signature and
// documents it asks for. The exam and step are kept in the address
// (?exam=upsc&step=signature) so refresh and the Back button work.

interface Route {
  preset?: Preset
  step: StepId
}

function readRoute(): Route {
  const params = new URLSearchParams(window.location.search)
  const preset = getPreset(params.get('exam') ?? '')
  const step = params.get('step')
  return { preset, step: isStepId(step) ? step : 'photo' }
}

function writeRoute(route: Route, mode: 'push' | 'replace') {
  const params = new URLSearchParams(window.location.search)
  if (route.preset) {
    params.set('exam', route.preset.id)
    params.set('step', route.step)
  } else {
    params.delete('exam')
    params.delete('step')
  }
  const query = params.toString()
  const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
  window.history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', url)
}

export default function ExamFlow() {
  const [route, setRoute] = useState<Route>(readRoute)
  // Prepared files for each exam's uploads, kept while moving between steps.
  const [uploads, setUploads] = useState<Record<string, UploadState>>({})
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const onPop = () => setRoute(readRoute())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function go(next: Route) {
    writeRoute(next, 'push')
    setRoute(next)
    // Move focus to the new step's heading, for keyboard and screen readers.
    requestAnimationFrame(() => headingRef.current?.focus())
  }

  if (!route.preset) {
    return <ExamPicker onPick={(preset) => go({ preset, step: 'photo' })} />
  }

  const preset = route.preset
  const steps = stepsFor(preset)
  const index = STEP_ORDER.indexOf(route.step)
  const step = steps[index]
  const key = (uploadId: string) => `${preset.id}/${uploadId}`
  const stateFor = (uploadId: string) =>
    uploads[key(uploadId)] ?? initialUploadState(preset.uploads.find((upload) => upload.id === uploadId)!)
  const readyCount = (uploadIds: string[]) =>
    uploadIds.filter((id) => uploads[key(id)]?.prepared?.status === 'ready').length

  return (
    <section className="flow" aria-labelledby="flow-heading">
      <div className="flow-top">
        <button type="button" className="link-button" onClick={() => go({ step: 'photo' })}>
          ← Change exam
        </button>
        <p className="flow-exam">
          <strong>{preset.name}</strong> · {preset.exam}
        </p>
      </div>

      <nav aria-label="Steps">
        <ol className="flow-steps">
          {steps.map((item, position) => {
            const ids = item.uploads.map((upload) => upload.id)
            const done = ids.length > 0 && readyCount(ids) === ids.length
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="flow-step"
                  aria-current={item.id === route.step ? 'step' : undefined}
                  onClick={() => go({ preset, step: item.id })}
                >
                  <span className="flow-step-number" aria-hidden="true">
                    {done ? '✓' : position + 1}
                  </span>
                  <span>
                    {item.title}
                    {ids.length > 0 && (
                      <span className="flow-step-count">
                        {readyCount(ids)}/{ids.length} ready
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <h2 id="flow-heading" ref={headingRef} tabIndex={-1}>
        Step {index + 1}: {step.title}
      </h2>

      {step.emptyNote ? (
        <p className="flow-empty">{step.emptyNote}</p>
      ) : (
        <div className="flow-uploads">
          {step.uploads.map((upload) => (
            <UploadCard
              key={key(upload.id)}
              upload={upload}
              state={stateFor(upload.id)}
              onChange={(update) =>
                setUploads((current) => ({
                  ...current,
                  [key(upload.id)]: update(current[key(upload.id)] ?? initialUploadState(upload)),
                }))
              }
            />
          ))}
        </div>
      )}

      {preset.liveCapture && step.id === 'photo' && step.uploads.length > 0 && (
        <p className="flow-note">
          {preset.name} also takes a live photo with your phone or webcam while you fill in the
          form. FormReady cannot do that part for you.
        </p>
      )}

      <div className="flow-nav">
        {index > 0 && (
          <button type="button" className="button button-quiet" onClick={() => go({ preset, step: STEP_ORDER[index - 1] })}>
            ← {steps[index - 1].title}
          </button>
        )}
        {index < STEP_ORDER.length - 1 && (
          <button type="button" className="button" onClick={() => go({ preset, step: STEP_ORDER[index + 1] })}>
            Next: {steps[index + 1].title} →
          </button>
        )}
      </div>

      <p className="flow-source">
        Rules from{' '}
        <a href={preset.source.url} target="_blank" rel="noreferrer">
          {preset.source.title}
        </a>
        , checked {preset.source.checkedOn}. Portals change their rules; check the latest notice before
        you apply.
      </p>
    </section>
  )
}
