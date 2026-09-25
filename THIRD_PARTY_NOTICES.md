# Third-party notices

Create and explore graphs with [Cytoscape.js](https://github.com/cytoscape/cytoscape.js).

Dependencies and bundled assets retain their upstream licenses. The MIT license
for original pure.science inc code does not relicense third-party material.

## Direct external runtime dependencies

This list covers dependencies declared by the snapshot package manifests, including
nested packages where present. It is not a complete transitive dependency inventory.
Consult the installed version’s license and notices before redistributing dependencies.

| Package | Declared version | Upstream |
| --- | --- | --- |
| `cytoscape` | `^3.30.2` | [cytoscape](https://github.com/cytoscape/cytoscape.js) |
| `cytoscape-svg` | `^0.4.0` | [cytoscape-svg](https://github.com/kinimesi/cytoscape-svg) |
| `react` | `^19.1.0` | [react](https://github.com/react/react) |
| `react-dom` | `^19.1.0` | [react-dom](https://github.com/react/react) |
| `styled-components` | `^6.1.18` | [styled-components](https://github.com/styled-components/styled-components) |

## GPL dependency

`cytoscape-svg` uses the GNU GPL version 3. Its upstream license is preserved in
[licenses/cytoscape-svg-GPL-3.0.txt](licenses/cytoscape-svg-GPL-3.0.txt).
The SVG export code imports this dependency. A distribution including it is not
an MIT-only application; follow the GPL requirements for the combined distribution.
