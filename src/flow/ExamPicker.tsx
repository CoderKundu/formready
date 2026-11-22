import { presets, type Preset } from '../presets'

interface ExamPickerProps {
  onPick: (preset: Preset) => void
}

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export default function ExamPicker({ onPick }: ExamPickerProps) {
  return (
    <section className="picker" aria-labelledby="picker-heading">
      <h2 id="picker-heading">Which exam are you applying for?</h2>
      <ul className="picker-list">
        {presets.map((preset) => (
          <li key={preset.id}>
            <button type="button" className="exam-card" onClick={() => onPick(preset)}>
              <span className="exam-card-name">{preset.name}</span>
              <span className="exam-card-body">{preset.body}</span>
              <span className="exam-card-exam">{preset.exam}</span>
              <span className="exam-card-date">Rules as of {formatDate(preset.source.checkedOn)}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="picker-note">
        Your exam is not listed? The PDF tool below works for any exam. More exams can be added;
        see the project on GitHub.
      </p>
    </section>
  )
}
