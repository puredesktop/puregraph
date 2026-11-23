import { act, useCallback, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PureGraphAgentContext } from '../agents/context'
import { buildPureGraphHandlers } from '../agents/operationsRegistry'
import { useGraphSession } from '../hooks/useGraphSession'
import { defaultGraphDocument, type GraphDocument } from '../lib/graphDocument'
import { GraphWorkspace } from './GraphWorkspace'

const captured = vi.hoisted(() => ({
  context: null as PureGraphAgentContext | null,
  writtenText: new Map<string, string>(),
}))

vi.mock('cytoscape', () => {
  const quiet = (): unknown =>
    new Proxy(function () {} as object, {
      get: (_target, key) => {
        if (key === Symbol.iterator) return function* () {}
        if (key === 'length') return 0
        if (key === 'zoom') return () => 1
        if (key === 'pan') return () => ({ x: 0, y: 0 })
        if (key === Symbol.toPrimitive) return () => 0
        if (key === 'then') return undefined
        return quiet()
      },
      apply: () => quiet(),
    })
  const factory = Object.assign(() => quiet(), { use: () => {} })
  return { default: factory }
})
vi.mock('@purescience/platform-ui/components/assets/CrossAppDragHandle', () => ({
  CrossAppDragHandle: () => <span data-testid="drag" />,
}))
vi.mock('../hooks/usePureGraphAgentTools', () => ({
  usePureGraphAgentTools: (_ready: boolean, ctx: PureGraphAgentContext | null) => {
    captured.context = ctx
  },
}))
vi.mock('../bridge/platformBridge', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(async (path: string, content: string) => {
    captured.writtenText.set(path, content)
  }),
  writeBinaryFile: vi.fn(),
  updateAssetMetadata: vi.fn(),
  openExportDialog: vi.fn(),
  openAssistantDrawer: vi.fn(),
  isStandaloneDevMode: () => false,
  updateGraphSettings: vi.fn(),
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

const invoke = (shortName: string, args: Record<string, unknown> = {}) => ({
  toolCallId: `tc_${shortName}`,
  shortName,
  arguments: args,
})

function WorkspaceHarness() {
  const session = useGraphSession()
  const documentRef = useRef<GraphDocument>(session.document)
  const pathRef = useRef<string | null>(null)
  const [documentPath, setDocumentPath] = useState<string | null>(null)

  const getLiveDocument = useCallback(() => documentRef.current, [])
  const getLiveDocumentPath = useCallback(() => pathRef.current, [])

  return (
    <GraphWorkspace
      ready={true}
      boot={{ prefs: { workingDirectory: '/Work' }, appSettings: {} } as never}
      proposal={session.proposal}
      onPropose={(title, commands) => session.propose(title, commands)}
      onDiscardProposal={id => session.discardProposal(id)}
      onApplyProposal={id => {
        const next = session.applyProposal(id)
        documentRef.current = next
      }}
      onCommand={commands => {
        const next = session.execute(commands)
        documentRef.current = next
      }}
      currentDocument={session.document}
      getLiveDocument={getLiveDocument}
      getLiveProposal={session.getProposal}
      getLiveDocumentPath={getLiveDocumentPath}
      documentPath={documentPath}
      documentTitle={session.document.title || 'Untitled graph'}
      loadedDocument={null}
      message={null}
      onSaveDocument={async () => {
        const title = documentRef.current.title || 'Untitled graph'
        const nextPath = pathRef.current ?? `/Drafts/${title}.graph`
        pathRef.current = nextPath
        setDocumentPath(nextPath)
        return nextPath
      }}
      onCreateGraph={async next => {
        const seeded = { ...defaultGraphDocument(), ...next }
        documentRef.current = seeded
        pathRef.current = null
        setDocumentPath(null)
        session.adopt(seeded)
      }}
      onLoadSample={async () => {}}
      canUndo={session.canUndo}
      canRedo={session.canRedo}
      onUndo={() => {
        documentRef.current = session.move('undo')
      }}
      onRedo={() => {
        documentRef.current = session.move('redo')
      }}
      saveStatus="New graph"
      onRetrySave={() => {}}
    />
  )
}

describe('GraphWorkspace + composite App Functions synchronous live-state integration', () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(async () => {
    captured.context = null
    captured.writtenText.clear()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => {
      root.render(<WorkspaceHarness />)
    })
    expect(captured.context).not.toBeNull()
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('fn_buildAndSaveGraph, fn_editGraphAndApply (discardExistingProposal), and fn_polishAndExportGraph all observe live mutations within a single turn', async () => {
    const handlers = buildPureGraphHandlers(() => {
      if (!captured.context) throw new Error('Context missing')
      return captured.context
    })

    // 1. Build and save a new graph: verifiedContext must reflect the new graph + saved path immediately
    let buildPayload: { data: Record<string, unknown> }
    await act(async () => {
      const res = await handlers.fn_buildAndSaveGraph!(
        invoke('fn_buildAndSaveGraph', {
          title: 'Live Network',
          layout: 'preset',
          elements: [
            { data: { id: 'a', label: 'Alpha', category: 'Core' }, position: { x: 0, y: 0 } },
            { data: { id: 'b', label: 'Beta', category: 'Leaf' }, position: { x: 100, y: 0 } },
            { data: { id: 'e1', source: 'a', target: 'b', label: 'links' } },
          ],
        }),
      )
      buildPayload = JSON.parse(res.content)
    })
    expect(buildPayload!.data.verifiedContext).toEqual({
      title: 'Live Network',
      nodeCount: 2,
      edgeCount: 1,
      layout: 'preset',
      documentPath: '/Drafts/Live Network.graph',
    })

    // 2. Stage a preview proposal, then discard it and apply a new edit in a single fn_editGraphAndApply call
    let previewId = ''
    await act(async () => {
      const res = await handlers.fn_editGraphAndApply!(
        invoke('fn_editGraphAndApply', {
          title: 'Obsolete preview',
          previewOnly: true,
          commands: [
            {
              type: 'add',
              elements: [{ data: { id: 'tmp', label: 'Temp' }, position: { x: 50, y: 50 } }],
            },
          ],
        }),
      )
      previewId = JSON.parse(res.content).data.proposalId
    })
    expect(previewId).toBeTruthy()

    let editPayload: { data: Record<string, unknown> }
    await act(async () => {
      const res = await handlers.fn_editGraphAndApply!(
        invoke('fn_editGraphAndApply', {
          title: 'Add gamma and retitle',
          discardExistingProposal: true,
          commands: [
            {
              type: 'add',
              elements: [
                {
                  data: { id: 'c', label: 'Gamma', category: 'Leaf' },
                  position: { x: 200, y: 0 },
                },
              ],
            },
            { type: 'title', title: 'Live Network v2' },
          ],
        }),
      )
      editPayload = JSON.parse(res.content)
    })
    expect(editPayload!.data.discardedProposalId).toBe(previewId)
    expect(editPayload!.data.verifiedContext).toEqual({
      title: 'Live Network v2',
      documentPath: '/Drafts/Live Network.graph',
      nodeCount: 3,
      edgeCount: 1,
      layout: 'preset',
    })

    // 3. Polish + saveView + export JSON in one call: exported JSON must include the new style, palette, and saved view
    let polishPayload: { data: Record<string, unknown> }
    await act(async () => {
      const res = await handlers.fn_polishAndExportGraph!(
        invoke('fn_polishAndExportGraph', {
          autoPalette: true,
          style: { nodeShape: 'round-rectangle', showEdgeLabels: true },
          saveView: { name: 'Overview', caption: 'Polished view' },
          save: true,
          exports: [{ format: 'json', filename: 'polished_snapshot' }],
        }),
      )
      polishPayload = JSON.parse(res.content)
    })
    expect(polishPayload!.data.appliedPolish).toBe(true)

    const exportedPath = '/Drafts/Live Network.graph/assets/figures/polished_snapshot.json'
    expect(captured.writtenText.has(exportedPath)).toBe(true)
    const exportedDoc = JSON.parse(captured.writtenText.get(exportedPath)!) as GraphDocument
    expect(exportedDoc.title).toBe('Live Network v2')
    expect(exportedDoc.style.nodeShape).toBe('round-rectangle')
    expect(exportedDoc.style.showEdgeLabels).toBe(true)
    expect(Object.keys(exportedDoc.style.categoryColors ?? {}).sort()).toEqual(['Core', 'Leaf'])
    expect(exportedDoc.views?.map(v => v.name)).toEqual(['Overview'])
  })
})
