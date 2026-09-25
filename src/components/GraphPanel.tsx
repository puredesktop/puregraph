import styled from 'styled-components'

/** Consistent form rhythm for PureGraph's inspectors, using platform tokens. */
export const GraphPanel = styled.section`
  display: grid;
  gap: 12px;
  min-width: 0;
  h2, h3, p { margin: 0; }
  h2 { font-size: 16px; font-weight: 650; }
  h3 { font-size: 13px; margin-top: 8px; }
  p { color: var(--pure-chrome-muted, #67727d); line-height: 1.5; overflow-wrap: anywhere; }
  label { display: grid; gap: 6px; font-size: 12px; font-weight: 500; }
  label:has(> input[type=checkbox]) { display: flex; align-items: center; gap: 8px; }
  input, textarea, button { font: inherit; color: inherit; min-width: 0; box-sizing: border-box; }
  input:not([type=checkbox]):not([type=color]), textarea, button {
    min-height: 32px;
    padding: 7px 9px;
    border: 1px solid var(--pure-chrome-line, #dce1e5);
    border-radius: 7px;
    background: var(--pure-chrome-surface, white);
  }
  input:not([type=checkbox]), textarea { width: 100%; }
  input[type=checkbox] { margin: 0; accent-color: var(--pure-chrome-accent, #267b66); }
  input[type=file] { font-size: 11px; }
  input::file-selector-button { border: 0; border-radius: 4px; padding: 4px 6px; margin-right: 8px; color: inherit; background: var(--pure-chrome-hover, #e8eeee); cursor: pointer; }
  button { cursor: pointer; font-size: 12px; font-weight: 500; }
  button:hover:not(:disabled) { background: var(--pure-chrome-hover, #e8eeee); }
  button:disabled { opacity: .4; cursor: default; }
  button[aria-pressed=true] { background: var(--pure-chrome-hover, #e8eeee); font-weight: 650; }
  summary { cursor: pointer; font-size: 12px; font-weight: 600; padding: 7px 0; }
  details[open] > :not(summary) { margin-top: 10px; }
  details > button { margin-right: 5px; }
  input[aria-invalid=true] { border-color: #b34a3e; }
  [role=alert] { color: #a03930; overflow-wrap: anywhere; }
  [role=status]:empty { display: none; }
`

export const ControlRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  > button { flex: 1; }
`

export const FieldRow = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
`
