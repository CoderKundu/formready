import { useEffect, useRef, useState } from 'react'
import {
  COMPRESSION_LEVELS,
  getProcessor,
  terminateProcessor,
  type CompressionLevelId,
} from '../workers/client'

// Download size of the Ghostscript WASM as served (gzip). Shown before the
// first compression so people on mobile data can decide.
const COMPRESSOR_DOWNLOAD_MB = 11

// Whether Ghostscript is already loaded in the worker this session.
let compressorReady = false

interface Compressed {
  url: string
  kilobytes: number
  levelLabel: string
  grayscale: boolean
  smaller: boolean
}

interface CompressPanelProps {
  source: Blob
  sourceKilobytes: number
}

export default function CompressPanel({ source, sourceKilobytes }: CompressPanelProps) {
  const [level, setLevel] = useState<CompressionLevelId>('balanced')
  const [grayscale, setGrayscale] = useState(false)
  const [busy, setBusy] = useState<'downloading' | 'compressing' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Compressed | null>(null)
  // Ignores the outcome of a run the user cancelled.
  const run = useRef(0)

  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url) }, [result])

  async function compress() {
    const id = ++run.current
    const choice = COMPRESSION_LEVELS.find((option) => option.id === level)!
    setError(null)
    setResult(null)
    try {
      const processor = getProcessor()
      if (!compressorReady) {
        setBusy('downloading')
        await processor.loadCompressor()
        compressorReady = true
      }
      if (id !== run.current) return
      setBusy('compressing')
      const output = await processor.compressPdf(source, { dpi: choice.dpi, grayscale })
      const { kilobytes } = await processor.describeBlob(output)
      if (id !== run.current) return
      setResult({
        url: URL.createObjectURL(output),
        kilobytes,
        levelLabel: choice.label,
        grayscale,
        smaller: output.size < source.size,
      })
    } catch (caught) {
      if (id !== run.current) return
      setError(caught instanceof Error ? caught.message : 'The PDF could not be compressed.')
    } finally {
      if (id === run.current) setBusy(null)
    }
  }

  function cancel() {
    run.current++
    // Ghostscript cannot be interrupted mid-run, so stop the whole worker.
    // The next compression downloads (or reuses the cached) compressor again.
    terminateProcessor()
    compressorReady = false
    setBusy(null)
  }

  const saved = result ? Math.round((1 - result.kilobytes / sourceKilobytes) * 100) : 0

  return (
    <div className="compress">
      <h3>Make it smaller</h3>
      <p>
        Lowers the resolution of scanned pages and photos inside the PDF. Text stays sharp.
      </p>

      <fieldset className="compress-levels" disabled={busy !== null}>
        <legend>Image quality</legend>
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

      <label className="compress-gray">
        <input
          type="checkbox"
          checked={grayscale}
          onChange={(event) => setGrayscale(event.target.checked)}
          disabled={busy !== null}
        />
        Black and white (much smaller for scanned documents)
      </label>

      {!compressorReady && busy === null && (
        <p className="compress-note">
          The first time, this downloads the compressor (about {COMPRESSOR_DOWNLOAD_MB} MB). It
          runs on your device; your PDF is not uploaded.
        </p>
      )}

      <div className="merger-actions">
        <button type="button" className="button" onClick={compress} disabled={busy !== null}>
          Compress {sourceKilobytes} KB PDF
        </button>
        {busy !== null && (
          <button type="button" className="button button-quiet" onClick={cancel}>
            Cancel
          </button>
        )}
      </div>

      <p className="merger-status" role="status">
        {busy === 'downloading' && `Downloading the compressor (about ${COMPRESSOR_DOWNLOAD_MB} MB)…`}
        {busy === 'compressing' && 'Compressing… this can take a while on a phone.'}
      </p>

      {error && (
        <p className="merger-errors" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="merger-result">
          {result.smaller ? (
            <p>
              {sourceKilobytes} KB → <strong>{result.kilobytes} KB</strong> ({saved}% smaller),{' '}
              {result.levelLabel.toLowerCase()}
              {result.grayscale ? ', black and white' : ''}.
            </p>
          ) : (
            <p>
              This setting did not make the file smaller ({result.kilobytes} KB). Keep the merged
              PDF, or try a lower quality or black and white.
            </p>
          )}
          {result.smaller && (
            <a className="button" href={result.url} download="compressed.pdf">
              Download compressed.pdf
            </a>
          )}
        </div>
      )}
    </div>
  )
}
