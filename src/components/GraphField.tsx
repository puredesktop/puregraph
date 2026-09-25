import { useEffect, useState } from 'react'
/** A rejected edit remains visibly invalid; Escape restores the authoritative value. */
export function GraphField({ value, label, onCommit }: { value: string; label: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value), [error, setError] = useState('')
  useEffect(() => { setDraft(value); setError('') }, [value])
  function commit() {
    if (draft === value) return
    try { onCommit(draft); setError('') } catch (failure) { setError(String(failure)) }
  }
  return <><input aria-label={label} aria-invalid={!!error} title={error || undefined} value={draft} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => {
    if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
    if (event.key === 'Escape') { event.preventDefault(); setDraft(value); setError('') }
  }} />{error && <small role="alert">{error} Press Escape to restore.</small>}</>
}
