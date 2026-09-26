<p><img src="docs/assets/app-icon.svg" width="88" height="88" alt="puregraph icon"></p>

# puregraph

**Explore connected data and network diagrams.** An app for [puredesktop](https://puredesktop.ai).

[Get started](#getting-started) · [App guide](docs/app-guide.md) · [Develop](docs/development.md) · [Developer account](https://puredesktop.ai/developers)

## What it does

A network-diagram workspace for importing connected data, inspecting relationships, choosing layouts, and styling nodes and edges. Save the editable graph or export a diagram for other people to explore.

## Requirements

Use a compatible [puredesktop](https://puredesktop.ai) build for desktop integration, storage, and the app drawer. Developer setup is covered in the [development guide](docs/development.md).

Bring node and edge data in JSON, CSV, or TSV. Agent assistance uses the host’s configured agent service.

## Getting started

1. Create a graph and import node and edge data.
2. Inspect nodes and connections, then choose a layout and adjust their styling.
3. Save the editable `.graph` document and use export controls when sharing a diagram.

## App layout

| Area | What you use it for |
| --- | --- |
| **Graph canvas** | Select nodes and edges, navigate the network, and inspect a layout. |
| **Data panel** | Import and review node and edge data from JSON, CSV, or TSV. |
| **Explore and style panels** | Find connections and paths; choose visual encodings and style presets. |
| **Review and export** | Review proposed graph changes and export static or interactive outputs. |

The app also uses the shared [puredesktop](https://puredesktop.ai) shell and drawer agent. Panels can vary with the current view and selection.

## Working with the agent

Open the app’s drawer in [puredesktop](https://puredesktop.ai) and describe what you want to do. For example:

> Find paths between these two nodes.
>
> Propose a clearer layout for this network.

The app exposes 22 tools, including `getGraphContext`, `fit`, `queryGraph`. See [agents.md](agents.md) for workflows and [plugin.json](plugin.json) for the complete tool schemas and approval flags. Some actions apply directly, while approval-marked actions ask first. Check the result in the app after a change.

## Files and data

Save editable `.graph` documents and export static or interactive diagrams. Imported node and edge attributes can be included in shared outputs.

## Develop and customize

We welcome **developers and vibecoders alike**. Fork puregraph, add a feature, or use what you learn to build a new app.

| Develop your way | Workflow |
| --- | --- |
| **Claude Code, Codex, or your editor** | Open the app’s source folder, read `README.md`, `plugin.json`, `package.json`, and `agents.md`, then make changes and run the app’s checks. Test inside [puredesktop](https://puredesktop.ai) with matching shared platform packages. |
| **purefactory** | Choose **Start building** for a new app, or select an available app project to extend it. Use **Open folder** for external tools and **Open app** to test. |
| **App drawer** | Request a local app change where app-development integration is available. Make clear whether you want to change the app itself or its current document. |

Use **Share** in purefactory to create a `.pureapp` package, then **Settings → System → Install an app → Choose package…** to load it in current builds. Source availability and integration vary by host build.

Follow the [development guide](docs/development.md) for Claude Code/Codex commands, app-specific setup and checks, and packaging. A standalone browser preview does not provide every desktop service.

## Documentation and limitations

| Guide | What it covers |
| --- | --- |
| [App guide](docs/app-guide.md) | App overview, source layout, and usage. |
| [Development guide](docs/development.md) | External coding tools, purefactory, checks, and installation. |
| [Agent guide](agents.md) | App-specific agent workflows and constraints. |

Review graph attributes before exporting. The `cytoscape-svg` dependency has a GPL-3.0 notice; the complete distribution must not be described as MIT-only.

## Contributing and marketplace

We welcome **developers and vibecoders alike**. Go to [puredesktop.ai](https://puredesktop.ai) and [create a developer account](https://puredesktop.ai/developers) to join the developer community and submit your app for review.

Bring improvements to this app, develop a fork, or build something entirely new. We welcome **open-source and proprietary projects alike** to the [puredesktop](https://puredesktop.ai) marketplace. Support for **paid apps is coming soon**, so you will be able to charge for your apps if you choose. Forks and redistributed dependencies must follow their applicable licenses.

For developer access, app submissions, or marketplace questions, contact [info@puredesktop.ai](mailto:info@puredesktop.ai).

Anyone may use, study, modify, and share this app under its applicable licenses. We welcome pull requests, bug reports, and documentation improvements. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits and license

Create and explore graphs with [Cytoscape.js](https://github.com/cytoscape/cytoscape.js).

### License

Original code by pure.science inc is licensed under the [MIT License](LICENSE).
Copyright (c) 2026 pure.science inc. Third-party code, dependencies, and assets retain their own licenses and copyright notices.

The SVG export dependency `cytoscape-svg` is GPL-3.0 licensed. The MIT license covers our original source only; it does not make a combined distribution with that dependency MIT-only. Preserve and comply with the GPL terms when distributing the combined application. See [third-party notices](THIRD_PARTY_NOTICES.md).

### Major open-source projects

| Project / source | Homepage or documentation | Support the maintainers |
| --- | --- | --- |
| [cytoscape/cytoscape.js](https://github.com/cytoscape/cytoscape.js) | [Homepage / docs](https://js.cytoscape.org) | — |
| [kinimesi/cytoscape-svg](https://github.com/kinimesi/cytoscape-svg) | [Homepage / docs](https://kinimesi.github.io/cytoscape-svg) | — |
| [react/react](https://github.com/react/react) | [Homepage / docs](https://react.dev) | — |
| [styled-components/styled-components](https://github.com/styled-components/styled-components) | [Homepage / docs](https://styled-components.com) | [GitHub Sponsors](https://github.com/sponsors/quantizor) · [Open Collective](https://opencollective.com/styled-components) |

Thank you to these projects and their contributors. Additional direct dependencies,
upstream links, and asset notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
