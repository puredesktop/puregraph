import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { graphContentFingerprint, type GraphDocument } from '../lib/graphDocument'
import type { GraphProposal } from '../lib/graphProposal'
import { graphSvg } from '../canvas/graphExport'
import { GraphPanel, ControlRow } from './GraphPanel'

const Notice = styled(GraphPanel)`
  margin: 0 12px 12px;
  padding: 12px 16px;
  border: 1px solid var(--pure-chrome-line, #dce1e5);
  border-radius: 10px;
  background: var(--pure-chrome-surface, white);
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  strong { display: block; margin-bottom: 3px; }
`
const Dialog = styled.dialog`
  width: min(960px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  box-sizing: border-box;
  overflow: auto;
  padding: 24px;
  border: 1px solid var(--pure-chrome-line, #dce1e5);
  border-radius: 16px;
  background: var(--pure-chrome-paper, white);
  color: var(--platform-colors-text, #29333d);
  font: inherit;
  box-shadow: 0 20px 80px #0003;
  &::backdrop { background: #14202d66; }
  h2 { font-size: 20px; }
  button[data-primary]:not(:disabled) { background: var(--pure-chrome-accent, #267b66); color: var(--pure-chrome-on-accent, white); border-color: transparent; }
  footer { position: sticky; bottom: -24px; padding: 16px 0; background: var(--pure-chrome-paper, white); }
`
const Comparison = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  figure { margin: 0; min-width: 0; }
  figcaption { font-weight: 600; margin-bottom: 8px; }
  img { width: 100%; border: 1px solid var(--pure-chrome-line, #dce1e5); border-radius: 8px; }
  @media (max-width: 650px) { grid-template-columns: minmax(0, 1fr); }
`

export function GraphProposalReview({ document, proposal, onApply, onDiscard }: {
  document: GraphDocument; proposal: GraphProposal | null
  onApply: (id: string) => void; onDiscard: (id: string) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false), [error, setError] = useState('')
  const [previews, setPreviews] = useState<string[]>([])
  useEffect(() => { setOpen(false); setError('') }, [proposal?.id])
  useEffect(() => {
    if (open) dialog.current?.showModal()
    else dialog.current?.close()
  }, [open])
  useEffect(() => {
    if (!open || !proposal) return
    let cancelled = false
    const urls: string[] = []
    setPreviews([])
    void Promise.all([document, proposal.next].map(doc => doc.elements.length ? graphSvg(doc, { width: 640, height: 440, transparent: false }).catch(() => '') : Promise.resolve(''))).then(svgs => {
      if (cancelled) return
      urls.push(...svgs.map(svg => svg ? URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })) : ''))
      setPreviews(urls)
    }).catch(failure => { if (!cancelled) setError(`Preview unavailable: ${String(failure)}`) })
    return () => { cancelled = true; urls.forEach(url => URL.revokeObjectURL(url)) }
  }, [open, document, proposal])
  if (!proposal) return null
  const stale = graphContentFingerprint(document) !== proposal.base
  function act(action: () => void) { try { action(); setOpen(false) } catch (failure) { setError(String(failure)) } }
  return <>
    <Notice aria-label="Pending graph proposal" role="status">
      <div><strong>Graph proposal ready</strong><p>{proposal.title} · Nothing applied yet</p></div>
      <button onClick={() => setOpen(true)}>Review proposal</button>
    </Notice>
    <Dialog ref={dialog} aria-labelledby="graph-proposal-heading" onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
      <GraphPanel>
        <h2 id="graph-proposal-heading">Review graph proposal</h2>
        <strong>{proposal.title}</strong>
        <p>Changes to “{document.title}”. This edits the current document; it does not create a new graph.</p>
        <p>{proposal.impact.added} added · {proposal.impact.changed} changed · {proposal.impact.removed} removed{proposal.impact.styleChanged ? ' · Style changed' : ''}</p>
        <Comparison>
          {['Current graph', 'Proposed graph'].map((label, index) => <figure key={label}><figcaption>{label}</figcaption>{previews[index] ? <img src={previews[index]} alt={label} /> : <p>{previews.length ? ([document, proposal.next][index].elements.length ? 'Preview unavailable; review the change counts above.' : 'Empty graph') : 'Preparing preview…'}</p>}</figure>)}
        </Comparison>
        {stale && <p role="alert">The graph changed after this proposal was prepared. Discard it and ask for an updated proposal.</p>}
        {error && <p role="alert">{error}</p>}
        <p>Apply makes one undoable change. Discard leaves the current graph unchanged.</p>
        <footer><ControlRow>
          <button onClick={() => setOpen(false)}>Back to graph</button>
          <button onClick={() => act(() => onDiscard(proposal.id))}>Discard proposal</button>
          <button data-primary disabled={stale} onClick={() => act(() => onApply(proposal.id))}>Apply proposal</button>
        </ControlRow></footer>
      </GraphPanel>
    </Dialog>
  </>
}
