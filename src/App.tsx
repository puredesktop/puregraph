import { useCallback, useEffect, useRef, useState } from 'react'
import { AppFrame } from '@purescience/platform-bridge/components/AppFrame'
import { EmptyState } from '@purescience/platform-ui/components/common/feedback/EmptyState'
import { usePlatformBridge } from '@purescience/platform-ui/bridge/react/usePlatformBridge'
import { usePlatformViewportResource } from '@purescience/platform-ui/bridge/react/usePlatformViewportResource'
import { useDocumentHotkeys } from '@purescience/platform-ui/bridge/react/useDocumentHotkeys'
import type { DocumentLifecycle } from '@purescience/platform-ui/bridge/react/useDocumentLifecycle'
import {
  DocumentHeaderActions,
  DocumentSwitcher,
} from '@purescience/platform-ui/components/common/documents'
import type { ResourceOpenEvent } from '@purescience/platform-ui/bridge/types'
import {
  isStandaloneDevMode,
  readTextFile,
  updateGraphSettings,
} from './bridge/platformBridge'
import { GraphWorkspace } from './components/GraphWorkspace'
import {
  GRAPH_APP_SLUG,
  GRAPH_ASSET_FIGURES_DIR,
  GRAPH_DOCUMENT_FILE,
  GRAPH_PACKAGE_SUFFIX,
} from './constants'
import { placeMissingNodes } from './lib/graphLayout'
import type { GraphCommand } from './lib/graphCommands'
import { useCompactInRoom } from './hooks/useCompactInRoom'
import { useSharedDocument } from './hooks/useSharedDocument'
import { mergeGraphs } from './lib/graphMerge'
import { useGraphRecovery } from './hooks/useGraphRecovery'
import { useGraphSession } from './hooks/useGraphSession'
import { usePureGraphBoot } from './hooks/usePureGraphBoot'
import {
  graphContentFingerprint,
  DEFAULT_GRAPH_TITLE,
  defaultGraphDocument,
  graphDocumentFromSample,
  parseGraphDocument,
  serializeGraphDocument,
  type GraphDocument,
} from './lib/graphDocument'
import type { GraphSample } from './lib/graphParser'
import { previewGraphImport } from './lib/graphImport'
import {
  graphPackageContentPath,
  graphTitleFromPath,
  resolveGraphPackagePath,
} from './lib/graphPaths'
import { graphSnapshotHtml } from './lib/graphSnapshot'

function fileNameFromPath(path: string): string {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? path
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function App(): React.ReactElement {
  const { error: bridgeError, ready, meta } = usePlatformBridge()
  const standaloneDev = isStandaloneDevMode()
  const bootReady = ready || standaloneDev
  const { boot, bootError, booting } = usePureGraphBoot(bootReady)
  const { resource: viewportResource, clearResource } =
    usePlatformViewportResource(ready && !standaloneDev, meta)

  if (bridgeError && !standaloneDev) {
    return (
      <AppFrame>
        <EmptyState
          tone="error"
          title="Bridge unavailable"
          message={bridgeError.message}
        />
      </AppFrame>
    )
  }

  if (!bootReady || !boot) {
    const message = bootError
      ? bootError.message
      : booting
        ? 'Loading Graph...'
        : 'Waiting for PureDesktop shell bridge...'

    return (
      <AppFrame>
        <EmptyState
          tone={bootError ? 'error' : 'neutral'}
          title={bootError ? 'Boot failed' : 'ps.graph'}
          message={message}
        />
      </AppFrame>
    )
  }

  return (
    <GraphDocumentApp
      ready={ready}
      boot={boot}
      viewportResource={viewportResource}
      onViewportResourceHandled={clearResource}
    />
  )
}

interface GraphDocumentAppProps {
  ready: boolean
  boot: NonNullable<ReturnType<typeof usePureGraphBoot>['boot']>
  viewportResource: ResourceOpenEvent | null
  onViewportResourceHandled: () => void
}

function GraphDocumentApp({
  ready,
  boot,
  viewportResource,
  onViewportResourceHandled,
}: GraphDocumentAppProps): React.ReactElement {
  const recovery = useGraphRecovery()
  const session = useGraphSession()
  const { document, adopt: adoptDocument, commit: setDocument } = session
  const navigationRef = useRef(0)
  const restoredLastDocument = useRef(false)
  // The live document, kept current synchronously by every writer.
  const documentRef = useRef(document)
  const savedContentRef = useRef<string | null>(graphContentFingerprint(document))
  // What serialize writes: the document of the package the lifecycle is
  // bound to. Both refs are assigned together with every rebind, so a
  // switch mid-flight never writes one graph's content into another's
  // package.
  const boundPathRef = useRef<string | null>(null)
  const boundDocumentRef = useRef(document)
  // Set when a new document should become a draft as soon as it has
  // rendered — the lifecycle names drafts from the rendered title, so
  // marking dirty before that render would file it under the previous
  // document's name.
  const persistAfterCommitRef = useRef(false)
  const lifecycleRef = useRef<DocumentLifecycle | null>(null)
  const [loadedDocument, setLoadedDocument] = useState<{
    document: GraphDocument
    nonce: number
    resetView?: boolean
  } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  // What a copy held in a page opens is not what the full app reopens next time.
  const compact = useCompactInRoom()
  const compactRef = useRef(compact)
  compactRef.current = compact

  /**
   * Replace the open graph with an unbound one. The outgoing package is
   * flushed first — resetting the lifecycle drops its pending autosave.
   */
  const startGraph = useCallback(
    async (seed: GraphDocument, notice: string | null, persist: boolean, saveOutgoing = true) => {
      seed = placeMissingNodes(seed)
      setSwitcherOpen(false)
      const lifecycle = lifecycleRef.current!
      const ticket = ++navigationRef.current
      const outgoing = documentRef.current
      try {
        if (saveOutgoing) await lifecycle.flush({ throwOnError: true })
        if (ticket !== navigationRef.current) return false
        if (documentRef.current !== outgoing) { setMessage('The graph changed while saving. Your edits are still open; try the document action again.'); return false }
        savedContentRef.current = persist ? null : graphContentFingerprint(seed)
        boundPathRef.current = null
        boundDocumentRef.current = seed
        documentRef.current = seed
        lifecycle.reset()
        persistAfterCommitRef.current = persist
        adoptDocument(seed)
        setLoadedDocument({ document: seed, nonce: Date.now() })
        setMessage(notice)
        if (persist) recovery.capture(seed, null)
        return true
      } catch (error) {
        setMessage(`Could not save the current graph: ${errorMessage(error)}`)
        return false
      }
    },
    [adoptDocument, recovery.capture],
  )

  const createNewGraph = useCallback(() => {
    startGraph(defaultGraphDocument(), null, false)
  }, [startGraph])

  // A sample is an explicit ask: it becomes its own new draft, never the
  // contents of whichever graph happened to be open.
  const loadSample = useCallback(async (sample: GraphSample): Promise<void> => {
    const opened = await startGraph(graphDocumentFromSample(sample), `Opened the "${sample.name}" sample as a new graph.`, true)
    if (!opened) throw new Error('The sample could not be opened because the current graph could not be saved.')
  }, [startGraph])

  const openGraphPath = useCallback(
    async (path: string, external = false): Promise<void> => {
      const ticket = ++navigationRef.current
      const atStart = documentRef.current
      const name = fileNameFromPath(path)
      try {
        const packagePath = resolveGraphPackagePath(path)
        if (!packagePath) {
          // A loose JSON/CSV/TSV file is data, not a package: import it as a
          // new draft rather than binding autosave to a bare file.
          const preview = previewGraphImport(await readTextFile(path))
          if (ticket !== navigationRef.current || documentRef.current !== atStart) return
          await startGraph(
            preview.document ?? { ...defaultGraphDocument(), title: graphTitleFromPath(path), elements: preview.elements },
            `Imported ${name} as a new graph.`,
            true,
          )
          return
        }
        const parsed = parseGraphDocument(
          await readTextFile(graphPackageContentPath(packagePath)),
        )
        if (ticket !== navigationRef.current || documentRef.current !== atStart) return
        if (external && boundPathRef.current !== packagePath) return
        const next = placeMissingNodes({ ...parsed, title: parsed.title || graphTitleFromPath(packagePath) })
        const lifecycle = lifecycleRef.current!
        if (boundPathRef.current !== packagePath) {
          // Switching packages: the outgoing one is written before the
          // binding moves. A reload of the bound package (an external
          // change) must not flush stale content over what was just read.
          await lifecycle.flush({ throwOnError: true })
          if (ticket !== navigationRef.current || documentRef.current !== atStart) return
          lifecycle.adopt(packagePath, { title: next.title })
        }
        savedContentRef.current = graphContentFingerprint(next)
        boundPathRef.current = packagePath
        boundDocumentRef.current = next
        documentRef.current = next
        persistAfterCommitRef.current = false
        adoptDocument(next, packagePath)
        setLoadedDocument({ document: next, nonce: Date.now() })
        setMessage(null)
        if (!compactRef.current) await updateGraphSettings({ packagePath })
      } catch (error) {
        setMessage(`Could not open ${name}: ${errorMessage(error)}`)
      }
    },
    [startGraph, adoptDocument],
  )

  const lifecycle = useSharedDocument({
    appSlug: GRAPH_APP_SLUG,
    suffix: GRAPH_PACKAGE_SUFFIX,
    kind: 'package',
    suggestedTitle: () => documentRef.current.title || DEFAULT_GRAPH_TITLE,
    // An agent, another app or a second copy of this one rewrote the open
    // package on disk. Reload, or merge if this copy has unsaved edits.
    contentFile: GRAPH_DOCUMENT_FILE,
    parse: parseGraphDocument,
    read: readTextFile,
    live: () => documentRef.current,
    merge: mergeGraphs,
    showMerged: merged => {
      documentRef.current = merged
      boundDocumentRef.current = merged
      setDocument(merged)
      setLoadedDocument({ document: merged, nonce: ++navigationRef.current, resetView: false })
      recovery.capture(merged, boundPathRef.current)
    },
    reload: path => {
      if (path === boundPathRef.current) void openGraphPath(path, true)
    },
    onSaved: files => {
      const content = files.find(file => file.name === GRAPH_DOCUMENT_FILE)?.content
      if (typeof content === 'string') { savedContentRef.current = graphContentFingerprint(parseGraphDocument(content)); recovery.saved(content) }
    },
    serialize: () => {
      const current = boundDocumentRef.current
      const title =
        current.title || DEFAULT_GRAPH_TITLE
      return [
        {
          name: 'manifest.json',
          content: `${JSON.stringify(
            {
              schemaVersion: 1,
              kind: 'purescience.graph.document',
              packageSuffix: GRAPH_PACKAGE_SUFFIX,
              title,
              contentFile: GRAPH_DOCUMENT_FILE,
              assetDirectories: [GRAPH_ASSET_FIGURES_DIR],
              savedAt: new Date().toISOString(),
            },
            null,
            2,
          )}\n`,
        },
        {
          name: GRAPH_DOCUMENT_FILE,
          content: serializeGraphDocument({ ...current, title }),
        },
        {
          name: `${GRAPH_ASSET_FIGURES_DIR}/.keep`,
          content: '',
        },
      ]
    },
  })
  lifecycleRef.current = lifecycle

  // A .graph package (or a JSON/CSV/TSV file) opened from PureFiles — the
  // boot binding or a later resource.open.
  useEffect(() => {
    const path = viewportResource?.path?.trim()
    if (!ready || !path) return
    void openGraphPath(path).finally(onViewportResourceHandled)
  }, [ready, viewportResource, onViewportResourceHandled, openGraphPath])

  useEffect(() => {
    if (!ready || restoredLastDocument.current) return
    restoredLastDocument.current = true
    // Explicit resource-open wins. A later resource event supersedes this read
    // through the existing navigation ticket, so it cannot be overwritten.
    if (!viewportResource?.path && boot.appSettings.packagePath) void openGraphPath(boot.appSettings.packagePath)
  }, [ready, viewportResource, boot.appSettings.packagePath, openGraphPath])

  // The lifecycle mints, promotes and renames paths on its own; the bound
  // path follows it so serialize and external-change checks stay aligned.
  useEffect(() => {
    const path = lifecycle.doc.path
    if (!path || boundPathRef.current === path) return
    boundPathRef.current = path
    session.bindKey(path)
  }, [lifecycle.doc.path, session.bindKey])

  // A filed or renamed package names the graph; keep the in-memory title
  // (export names, agent context) in step with it.
  useEffect(() => {
    const title = lifecycle.doc.title
    if (!lifecycle.doc.path || !title || title === documentRef.current.title) {
      return
    }
    const next = { ...documentRef.current, title }
    documentRef.current = next
    boundDocumentRef.current = next
    setDocument(next)
  }, [lifecycle.doc.path, lifecycle.doc.title])

  useEffect(() => {
    if (!persistAfterCommitRef.current) return
    persistAfterCommitRef.current = false
    lifecycleRef.current!.markDirty()
  }, [document])

  const saveDocument = useCallback(async (throwOnError = false): Promise<string | null> => {
    boundDocumentRef.current = documentRef.current
    const lifecycle = lifecycleRef.current!
    const path = await lifecycle.ensureDraft()
    if (!path) return null
    await lifecycle.flush({ throwOnError })
    if (!compactRef.current) await updateGraphSettings({ packagePath: path })
    return path
  }, [])

  const moveHistory = useCallback((direction: 'undo' | 'redo') => {
    const next = session.move(direction)
    documentRef.current = next
    boundDocumentRef.current = next
    setLoadedDocument({ document: next, nonce: ++navigationRef.current, resetView: false })
    recovery.capture(next, boundPathRef.current)
    lifecycleRef.current!.markDirty()
  }, [session.move, recovery.capture])

  const executeCommands = useCallback((commands: GraphCommand[]) => {
    const next = session.execute(commands)
    documentRef.current = next
    boundDocumentRef.current = next
    recovery.capture(next, boundPathRef.current)
    setLoadedDocument({ document: next, nonce: ++navigationRef.current, resetView: false })
    lifecycleRef.current!.markDirty()
  }, [session.execute, recovery.capture])

  useDocumentHotkeys({
    onSave: () => void saveDocument(),
    onNew: createNewGraph,
    onOpen: () => setSwitcherOpen(true),
  })

  // Switcher snapshots: the real renderer, keyed by document content.
  const loadGraphPreview = useCallback(
    async (item: {
      path: string
      kind: 'package' | 'file'
    }): Promise<{ kind: 'html'; html: string; title?: string } | null> => {
      if (item.kind !== 'package') return null
      try {
        const parsed = parseGraphDocument(
          await readTextFile(graphPackageContentPath(item.path)),
        )
        const html = await graphSnapshotHtml(parsed)
        return html ? { kind: 'html', html, title: parsed.title } : null
      } catch {
        return null
      }
    },
    [],
  )

  return (
    <AppFrame
      {...(compact ? { 'data-compact-room': '' } : undefined)}
      headerDocumentName={
        document.title?.trim() || (lifecycle.doc.path ? fileNameFromPath(lifecycle.doc.path) : undefined)
      }
      headerActions={
        <DocumentHeaderActions
          lifecycle={lifecycle}
          title={document.title || DEFAULT_GRAPH_TITLE}
          onOpenSwitcher={() => setSwitcherOpen(true)}
        />
      }
    >
      {recovery.error && <div role="alert">{recovery.error}</div>}
      {recovery.entries.map(entry => <div key={entry.id} role="status">
        Interrupted work: {entry.document.title}
        <button onClick={() => void recovery.recover(entry.id, recovered => startGraph(recovered, 'Recovered as a separate graph.', true))}>Recover a copy</button>
        <button onClick={() => void recovery.discard(entry.id)}>Discard recovery</button>
      </div>)}
      <GraphWorkspace
        ready={ready}
        boot={boot}
        onPropose={(title, commands) => { const result = session.propose(title, commands); if (!lifecycle.doc.path) lifecycle.markDirty(); return result }}
        proposal={session.proposal}
        onDiscardProposal={session.discardProposal}
        onApplyProposal={proposalId => {
          const next = session.applyProposal(proposalId)
          documentRef.current = next; boundDocumentRef.current = next
          recovery.capture(next, boundPathRef.current)
          setLoadedDocument({ document: next, nonce: ++navigationRef.current, resetView: false })
          lifecycleRef.current!.markDirty()
        }}
        onCommand={executeCommands}
        canUndo={session.canUndo}
        canRedo={session.canRedo}
        onUndo={() => moveHistory('undo')}
        onRedo={() => moveHistory('redo')}
        currentDocument={document}
        documentPath={lifecycle.doc.path}
        documentTitle={document.title || DEFAULT_GRAPH_TITLE}
        loadedDocument={loadedDocument}
        message={(lifecycle.doc.error?.includes('Save conflict') ? null : lifecycle.doc.error) ?? message}
        compact={compact}
        saveStatus={lifecycle.doc.saving ? 'Saving…' : lifecycle.doc.error && !lifecycle.doc.error.includes('Save conflict') ? 'Not saved' : lifecycle.doc.savedAt ? 'Saved' : 'New graph'}
        onRetrySave={() => { void saveDocument(true).catch(error => setMessage(errorMessage(error))) }}
        onSaveDocument={() => saveDocument(true)}
        onCreateGraph={async next => {
          const opened = await startGraph(next, `Created “${next.title}” as a new graph.`, true)
          if (!opened) throw new Error('Could not create the new graph. The current document is still open; resolve its save error and retry.')
        }}
        onLoadSample={loadSample}
      />
      <DocumentSwitcher
        appSlug={GRAPH_APP_SLUG}
        suffixes={[GRAPH_PACKAGE_SUFFIX]}
        variant="modal"
        loadPreview={loadGraphPreview}
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        onOpenDocument={path => {
          setSwitcherOpen(false)
          void openGraphPath(path)
        }}
        onCreateNew={createNewGraph}
        newLabel="New graph"
        title="Open a graph"
        itemNoun="graph"
      />
    </AppFrame>
  )
}
