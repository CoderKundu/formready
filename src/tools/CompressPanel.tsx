import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { maxBytesFor, toKB } from '../workers/kilobytes'
import {
  COMPRESSION_LEVELS,
  getProcessor,
  proxy,
  terminateProcessor,
  type Attempt,
  type CompressionLevelId,
} from '../workers/client'

// Download size of the Ghostscript WASM as served (Brotli, measured on the
// live site). Shown before the first compression so people on mobile data
// can decide.
const COMPRESSOR_DOWNLOAD_MB = 11

// Common portal limits for document PDFs, in KB.
const QUICK_LIMITS = [100, 200, 300, 500]

// Whether Ghostscript is already loaded in the worker this session.
let compressorReady = false


type Outcome =
  | { kind: 'already-fits'; maxKB: number }
  | { kind: 'fits'; url: string; kilobytes: number; dpi: number; maxKB: number; attempts: Attempt[] }
  | { kind: 'too-big'; kilobytes: number; dpi: number; maxKB: number }
  | { kind: 'quality'; url: string; kilobytes: number; label: string; smaller: boolean }

interface CompressPanelProps {
  source: Blob
  sourceKilobytes: number
}

export default function CompressPanel({ source, sourceKilobytes }: CompressPanelProps) {
  const [maxKB, setMaxKB] = useState('200')
  const [level, setLevel] = useState<CompressionLevelId>('balanced')
  const [grayscale, setGrayscale] = useState(false)
  const [busy, setBusy] = useState<'downloading' | 'compressing' | null>(null)
  const [trying, setTrying] = useState<Attempt[]>([])
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  // Ignores the outcome of a run the user cancelled.
  const run = useRef(0)
  const limitId = useId()

  useEffect(
    () => () => {
      if (outcome && 'url' in outcome) URL.revokeObjectURL(outcome.url)
    },
    [outcome],
  )

  // Shared setup for both ways of compressing. Returns false if cancelled.
  async function start(id: number): Promise<boolean> {
    setError(null)
    setOutcome(null)
    setTrying([])
    if (!compressorReady) {
      setBusy('downloading')
      await getProcessor().loadCompressor()
      compressorReady = true
    }
    if (id !== run.current) return false
    setBusy('compressing')
    return true
  }

  async function fitToLimit(event: FormEvent) {
    event.preventDefault()
    const limit = Number(maxKB)
    if (!Number.isFinite(limit) || limit <= 0) {
      setError('Enter the portal’s size limit in KB, for example 200.')
      return
    }
    const id = ++run.current
    try {
      // A file that already fits needs no compressor download.
      if (source.size <= maxBytesFor(limit) && !grayscale) {
        setError(null)
        setOutcome({ kind: 'already-fits', maxKB: limit })
        return
      }
      if (!(await start(id))) return
      const result = await getProcessor().compressPdfToSize(
        source,
        { maxKB: limit, grayscale },
        proxy((attempt: Attempt) => {
          if (id === run.current) setTrying((current) => [...current, attempt])
        }),
      )
      if (id !== run.current) return
      if (result.status === 'fits') {
        setOutcome({
          kind: 'fits',
          url: URL.createObjectURL(result.blob),
          kilobytes: toKB(result.bytes),
          dpi: result.dpi!,
          maxKB: limit,
          attempts: result.attempts,
        })
      } else if (result.status === 'too-big') {
        setOutcome({ kind: 'too-big', kilobytes: toKB(result.bytes), dpi: result.dpi!, maxKB: limit })
      } else {
        setOutcome({ kind: 'already-fits', maxKB: limit })
      }
    } catch (caught) {
      if (id === run.current) {
        setError(caught instanceof Error ? caught.message : 'The PDF could not be compressed.')
      }
    } finally {
      if (id === run.current) setBusy(null)
    }
  }

  async function compressAtQuality() {
    const id = ++run.current
    const choice = COMPRESSION_LEVELS.find((option) => option.id === level)!
    try {
      if (!(await start(id))) return
      const output = await getProcessor().compressPdf(source, { dpi: choice.dpi, grayscale })
      if (id !== run.current) return
      setOutcome({
        kind: 'quality',
        url: URL.createObjectURL(output),
        kilobytes: toKB(output.size),
        label: `${choice.label.toLowerCase()} (${choice.dpi} dpi)`,
        smaller: output.size < source.size,
      })
    } catch (caught) {
      if (id === run.current) {
        setError(caught instanceof Error ? caught.message : 'The PDF could not be compressed.')
      }
    } finally {
      if (id === run.current) setBusy(null)
    }
  }

  function cancel() {
    run.current++
    // Ghostscript cannot be interrupted mid-run, so stop the whole worker.
    // The next compression loads the compressor again (from the browser cache).
    terminateProcessor()
    compressorReady = false
    setBusy(null)
    setTrying([])
  }

  const disabled = busy !== null
  const savedPercent = (kilobytes: number) => Math.round((1 - kilobytes / sourceKilobytes) * 100)

  return (
    <div className="compress">
      <h3>Make it smaller</h3>
      <p>
        Lowers the resolution of scanned pages and photos inside the PDF. Text stays sharp.
      </p>

      <form className="compress-target" onSubmit={fitToLimit}>
        <label htmlFor={limitId} className="compress-label">
          Portal’s size limit
        </label>
        <div className="compress-limit-row">
          <input
            id={limitId}
            className="compress-limit"
            type="number"
            inputMode="decimal"
            min="1"
            step="any"
            value={maxKB}
            onChange={(event) => setMaxKB(event.target.value)}
            disabled={disabled}
            aria-describedby={`${limitId}-hint`}
          />
          <span>KB</span>
          <button type="submit" className="button" disabled={disabled}>
            Fit under {maxKB || '…'} KB
          </button>
        </div>
        <div className="compress-quick" role="group" aria-label="Common limits">
          {QUICK_LIMITS.map((limit) => (
            <button
              key={limit}
              type="button"
              className="chip"
              aria-pressed={maxKB === String(limit)}
              onClick={() => setMaxKB(String(limit))}
              disabled={disabled}
            >
              {limit} KB
            </button>
          ))}
        </div>
        <p id={`${limitId}-hint`} className="compress-note">
          Keeps the best quality that fits. Your PDF is {sourceKilobytes} KB.
        </p>
      </form>

      <label className="compress-gray">
        <input
          type="checkbox"
          checked={grayscale}
          onChange={(event) => setGrayscale(event.target.checked)}
          disabled={disabled}
        />
        Black and white (much smaller for scanned documents)
      </label>

      <details className="compress-manual">
        <summary>Or choose the quality yourself</summary>
        <fieldset className="compress-levels" disabled={disabled}>
          <legend className="visually-hidden">Image quality</legend>
          {COMPRESSION_LEVELS.map((option) => (
            <label key={option.id} className="compress-level">
              <input
                type="radio"
                name="compression-level"
                value={option.id}
                checked={level === option.id}
                onChange={() => setLevel(option.id)}
              />
              <span>
                {option.label} <span className="compress-dpi">({option.dpi} dpi)</span>
              </span>
            </label>
          ))}
        </fieldset>
        <button type="button" className="button button-quiet" onClick={compressAtQuality} disabled={disabled}>
          Compress at this quality
        </button>
      </details>

      {!compressorReady && !disabled && (
        <p className="compress-note">
          The first compression downloads the compressor (about {COMPRESSOR_DOWNLOAD_MB} MB). It
          runs on your device; your PDF is not uploaded.
        </p>
      )}

      {disabled && (
        <div className="merger-actions">
          <button type="button" className="button button-quiet" onClick={cancel}>
            Cancel
          </button>
        </div>
      )}

      <p className="merger-status" role="status">
        {busy === 'downloading' && `Downloading the compressor (about ${COMPRESSOR_DOWNLOAD_MB} MB)…`}
        {busy === 'compressing' &&
          (trying.length === 0
            ? 'Compressing… this can take a while on a phone.'
            : `Compressing… tried ${trying.map((attempt) => `${attempt.dpi} dpi (${toKB(attempt.bytes)} KB)`).join(', ')}.`)}
      </p>

      {error && (
        <p className="merger-errors" role="alert">
          {error}
        </p>
      )}

      {outcome && (
        <div className="merger-result">
          {outcome.kind === 'already-fits' && (
            <p>
              Your PDF is already under {outcome.maxKB} KB ({sourceKilobytes} KB), so it was left
              as it is. Use the merged PDF above.
            </p>
          )}
          {outcome.kind === 'fits' && (
            <>
              <p>
                {sourceKilobytes} KB → <strong>{outcome.kilobytes} KB</strong>, under{' '}
                {outcome.maxKB} KB ({savedPercent(outcome.kilobytes)}% smaller). Images at{' '}
                {outcome.dpi} dpi{grayscaleNote(grayscale)}, the best quality that fits.
              </p>
              <a className="button" href={outcome.url} download="compressed.pdf">
                Download compressed.pdf
              </a>
            </>
          )}
          {outcome.kind === 'too-big' && (
            <p>
              Could not get under {outcome.maxKB} KB. The smallest was {outcome.kilobytes} KB at{' '}
              {outcome.dpi} dpi.{' '}
              {grayscale
                ? 'Try removing pages you don’t need.'
                : 'Try black and white, or remove pages you don’t need.'}
            </p>
          )}
          {outcome.kind === 'quality' &&
            (outcome.smaller ? (
              <>
                <p>
                  {sourceKilobytes} KB → <strong>{outcome.kilobytes} KB</strong> (
                  {savedPercent(outcome.kilobytes)}% smaller), {outcome.label}
                  {grayscaleNote(grayscale)}.
                </p>
                <a className="button" href={outcome.url} download="compressed.pdf">
                  Download compressed.pdf
                </a>
              </>
            ) : (
              <p>
                This setting did not make the file smaller ({outcome.kilobytes} KB). Keep the
                merged PDF, or try a lower quality or black and white.
              </p>
            ))}
        </div>
      )}
    </div>
  )
}

function grayscaleNote(grayscale: boolean): string {
  return grayscale ? ', black and white' : ''
}
