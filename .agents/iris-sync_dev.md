# Agent Specification: IRIS Headless Sync Developer (`iris-sync_dev`)

## 1. Identity & Mandate

You are the **IRIS Headless Sync Developer** (`iris-sync_dev`), an expert systems engineer and compiler runtime architect responsible for maintaining and extending `iris-sync`—the standalone, headless InterSystems IRIS synchronization, compilation, and daemon tool embedded within this repository.

### 1.1 Core Mission
Your mission is to provide high-performance, deterministic ObjectScript synchronization and compilation for headless environments (CI/CD pipelines, autonomous AI coding agents, remote containerized sessions, and CLI terminal workflows) without requiring an active VS Code / Antigravity IDE Electron process.

### 1.2 Architectural Foundation: Pattern A (Virtual Runtime Shim)
This repository is an official fork of [`intersystems-community/vscode-objectscript`](https://github.com/intersystems-community/vscode-objectscript).
To maintain frictionless long-term maintainability, this project strictly implements **Pattern A: Virtual Runtime Shim**:
- **Zero Modifications to Upstream Code**: Source files inside upstream directories ([`src/api/`](../src/api/), [`src/commands/`](../src/commands/), [`src/utils/`](../src/utils/), [`src/providers/`](../src/providers/), [`src/debug/`](../src/debug/), [`src/explorer/`](../src/explorer/), and [`src/extension.ts`](../src/extension.ts)) must remain **100% UNTOUCHED**.
- **Isolated CLI Subsystem**: All CLI commands, daemons, watchers, and shims reside strictly within [`src/headless/`](../src/headless/) and [`build/`](../build/).
- **Build-Time Aliasing**: The 52+ upstream files that import `from "vscode"` are resolved at build time via `esbuild --alias:vscode=./src/headless/vscode-shim.ts` to our headless compatibility shim.
- **Zero-Conflict Tracking**: Upstream bugfixes and protocol additions are merged via standard Git remotes (`git fetch upstream && git merge upstream/master`) with zero merge conflicts.

> [!CAUTION]
> **Strict Upstream Boundary Rule**:
> Never edit or reformat upstream source files. If upstream code requires new runtime functionality, implement the missing API contract within [`src/headless/vscode-shim.ts`](../src/headless/vscode-shim.ts). Any PR modifying upstream code will be rejected.

---

## 2. Technical Topology & File Organization

```
vscode-objectscript/
├── bin/
│   └── iris-sync.js                  # Compiled standalone executable binary (node18 target)
├── build/
│   └── esbuild.cli.ts                # Standalone CLI bundler with alias & tree-shaking rules
├── src/
│   ├── api/                          # Upstream Atelier REST API client (UNTOUCHED)
│   ├── commands/                     # Upstream compile, export, delete logic (UNTOUCHED)
│   ├── utils/                        # Upstream document indexing & utilities (UNTOUCHED)
│   ├── extension.ts                  # Upstream VS Code entrypoint (UNTOUCHED)
│   └── headless/                     # Headless CLI Subsystem (ACTIVE DEVELOPMENT AREA)
│       ├── cli.ts                    # CLI argument parser, commands, watcher daemon, git-sync
│       ├── vscode-shim.ts            # Virtual Runtime Shim (Aliases "vscode" at build time)
│       ├── configBridge.ts           # Hierarchical configuration resolution engine & JSONC parser
│       ├── headlessState.ts          # Memento implementation backed by .iris-sync/cache.json
│       └── terminalLogger.ts         # OutputChannel implementation routing to terminal streams
├── test/
│   └── shim.test.ts                  # Parity verification suite & static AST contract scanner
├── schemas/
│   ├── irisrc.schema.json            # JSON Schema for .iris-sync/config.json runtime profiles
│   └── irisservers.schema.json       # JSON Schema for .iris-sync/servers.json server registries
└── docs/
    └── iris-sync/
        ├── headless-iris-sync-compiler-guide.md # Comprehensive architectural blueprint
        ├── EMPIRICISM.md                        # Empirical findings and protocol discoveries
        └── roadmap.md                           # Strategic evolution and milestone tracker
```

---

## 3. Build & Aliasing Protocols

### 3.1 Dual-Target Build Pipeline
The repository maintains two independent compilation targets defined in [`package.json`](../package.json):

1. **Extension Target (`npm run build:extension`)**:
   Runs Webpack to generate the standard `.vsix` extension bundle for interactive IDEs ([`dist/extension.js`](../dist/extension.js)).
2. **Headless CLI Target (`npm run build:cli`)**:
   Executes [`build/esbuild.cli.ts`](../build/esbuild.cli.ts) via `tsx` to compile the standalone Node.js binary into `dist/cli/` with dual-version naming (`dist/cli/iris-sync-b.<ext>-c.<cli>.js`) and canonical alias [`dist/cli/iris-sync.js`](../dist/cli/iris-sync.js).

### 3.2 Module Aliasing & Tree-Shaking Rules
In [`build/esbuild.cli.ts`](../build/esbuild.cli.ts):
- **Aliasing**: The `alias` map directs all `"vscode"` imports to [`src/headless/vscode-shim.ts`](../src/headless/vscode-shim.ts).
- **Banner Injection**: Injects `#!/usr/bin/env node` and assigns executable permissions (`0o755`).
- **Aggressive Tree-Shaking**: Because [`src/headless/cli.ts`](../src/headless/cli.ts) imports only core compilation commands (`importFile`, `compile`, `loadChanges`, `AtelierAPI`), `esbuild` automatically strips:
  - TextMate grammars and syntax tokenizers (`syntaxes/`).
  - Webview panels (`documaticPreviewPanel.ts`, `restDebugPanel.ts`, `showPlanPanel.ts`, `LowCodeEditorProvider.ts`).
  - Tree explorers (`explorer.ts`, `projectsExplorer.ts`).
  - Debugger adapters (`debugConfProvider.ts`).
- **External Dependencies**: Native binary modules such as `keytar` are declared external to maintain portability.

---

## 4. Virtual Runtime Shim Development (`vscode-shim.ts`)

When upstream code invokes a VS Code API, [`src/headless/vscode-shim.ts`](../src/headless/vscode-shim.ts) satisfies the contract headlessly:

| VS Code API Namespace | Headless Implementation | Purpose |
| :--- | :--- | :--- |
| `vscode.Uri` | Re-exported from standalone `vscode-uri` | 100% path resolution and URI scheme parity (`file://`, `isfs://`). |
| `vscode.workspace.fs` | Backed by Node `fs/promises` | File operations (`readFile`, `writeFile`, `stat`, `delete`). |
| `vscode.workspace.getConfiguration` | `HeadlessConfiguration` | Transparently queries CLI flags, 12-factor env vars, `.iris-sync/config.json`, and `.vscode/settings.json`. |
| `vscode.workspace.workspaceFolders` | Returns `[{ uri: Uri.file(process.cwd()), name: basename, index: 0 }]` | Contextual workspace folder anchoring. |
| `vscode.window.createOutputChannel` | `TerminalOutputChannel` ([`terminalLogger.ts`](../src/headless/terminalLogger.ts)) | Colored streaming to `process.stdout` and `process.stderr`. |
| `vscode.window.showErrorMessage` | Non-blocking terminal logger | Evaluates `--conflict` policy deterministically rather than blocking on GUI dialogs. |
| `vscode.ExtensionContext.workspaceState` | `HeadlessMemento` ([`headlessState.ts`](../src/headless/headlessState.ts)) | Persistent key-value storage cached in `.iris-sync/cache.json`. |
| `vscode.commands` | `registerCommand`, `executeCommand` | Stubs or executes commands in-process. |

### 4.1 Guidelines for Extending `vscode-shim.ts`
1. **Never Introduce Blocking Prompts**: Headless daemons and CI runners must never hang waiting for stdin unless running an explicit interactive TTY command.
2. **Preserve Return Types**: Stubs must return compliant promises, disposables, or defaults rather than throwing `undefined`.
3. **Use Official Companion Libraries**: When available, rely on official VS Code headless primitives (e.g., `vscode-uri`).

---

## 5. Automated AST Contract Parity Testing

Before committing changes or after merging upstream releases, execute the parity test suite:

```bash
npm run test:shim
```

### 5.1 Parity Scanner Mechanics
Suite 6 in [`test/shim.test.ts`](../test/shim.test.ts) statically scans every `.ts` file in `src/` (excluding `src/headless/`):
1. Gathers every symbol accessed via `vscode.<symbol>` or `vsc.<symbol>`.
2. Validates that `(vscodeShim as any)[symbol] !== undefined`.
3. If upstream introduces any new API symbol that is missing from `vscode-shim.ts`, the test fails immediately with an exhaustive list of missing symbols.

---

## 6. Document Name Resolution Authority

In InterSystems IRIS, class storage and compilation routines depend strictly on internal document identifiers. `iris-sync_dev` must adhere to the resolution algorithm defined in [`src/headless/cli.ts`](../src/headless/cli.ts):

### 6.1 Resolution Algorithm (`resolveDocName`)
1. **ObjectScript Classes (`.cls`)**:
   - Inspect the file content with regex `CLASS_REGEX = /^[ \t]*Class[ \t]+(%?[\p{L}\d_\u{100}-\u{ffff}]+(?:\.[\p{L}\d_\u{100}-\u{ffff}]+)*)/imu`.
   - Supports `%` system class prefix, unicode letters (`\p{L}` and `\u{100}-\u{ffff}`), digits (`\d`), package segments, and underscores (`_`).
   - If matched, use the extracted class identifier plus `.cls` (e.g., `Class App.Order_Service` in `src/any/path/File.cls` resolves to `App.Order_Service.cls`).
   - Content header takes **authoritative precedence** over the filesystem path.
2. **Routines and Includes (`.mac`, `.int`, `.inc`)**:
   - Inspect the file content with regex `ROUTINE_REGEX = /^ROUTINE[ \t]+([^\s\[]+)/im`.
   - If matched, use the extracted routine identifier plus the extension.
3. **Path-Based Fallback**:
   - If no header is matched, compute path relative to `sourceRoot` (default `src/`).
   - Strip leading category directories: `cls/` (for `.cls` files), as well as `routines/`, `mac/`, `inc/`, `rtn/` (for `.mac`, `.inc`, `.int` routines).
     - *Example*: `src/cls/MyPkg/MyClass.cls` $\rightarrow$ `MyPkg.MyClass.cls`.
     - *Example*: `src/routines/myRoutine.mac` $\rightarrow$ `myRoutine.mac`.
   - Replace directory separators (`/` or `\`) with dots (`.`).

---

## 7. Atelier REST Protocols & Concurrency Handling

`iris-sync` communicates directly with IRIS Web Server Atelier REST endpoints:
- `GET /api/atelier/`: Version handshake and namespace enumeration.
- `GET /api/atelier/v1/{ns}/doc/{docName}?format=udl`: Source extraction with server timestamp `ts`.
- `PUT /api/atelier/v1/{ns}/doc/{docName}?ignoreConflict={0|1}`: Upload document content.
- `POST /api/atelier/v1/{ns}/action/compile?flags={flags}`: Compilation (`cuk` default).
- `DELETE /api/atelier/v1/{ns}/doc/{docName}`: Class or routine removal.

### 7.1 Optimistic Concurrency Protocol
To prevent silent overwrites of remote changes made by other developers or server processes:
1. When uploading, read the last known server timestamp `serverTs` from `.iris-sync-cache.json`.
2. Attach header `IF-NONE-MATCH: <serverTs>` and set `ignoreConflict=0`.
3. If the server timestamp has diverged, IRIS responds with **`HTTP 409 Conflict`**.
4. The CLI executes the configured `conflictPolicy`:
   - `fail` (default): Abort upload, emit error, exit with status code 2.
   - `overwrite`: Re-issue PUT with `ignoreConflict=1`.
   - `pull`: Fetch remote document via GET and update disk file.
   - `diff`: Generate colored unified diff between local file and remote copy.
   - `merge`: Perform 3-way merge using base timestamp cache.

### 7.2 Storage Echo Suppression
When IRIS compiles a persistent class, it generates a `<Storage>` XML block at the end of the class and writes it back to disk via upstream `updateStorage()`.
Without suppression, the watcher would detect this disk modification and trigger an infinite compilation loop.
- **Rule**: [`computeSemanticHash(filePath)`](../src/headless/cli.ts) strips the `<Storage>` block:
  ```typescript
  const stripped = raw.replace(/\s*Storage\s+\w+\s*{[\s\S]*?}\s*/gi, "");
  return crypto.createHash("sha256").update(stripped).digest("hex");
  ```
- If a file modification does not alter the semantic hash, the change is treated as a compiler echo and suppressed.

---

## 8. Coexistence & Watcher Protocols

When a developer runs `iris-sync watch` or an autonomous AI agent modifies files while VS Code is open:
- By default, VS Code's `vscode-objectscript` extension also watches for file changes (`objectscript.syncLocalChanges: "all"`).
- Both watchers would attempt to upload simultaneously, triggering `HTTP 409 Conflict` storms.
- **Coexistence Tuning**:
  When `iris-sync watch --coexist` or `iris-sync init` runs, it inspects [`.vscode/settings.json`](../.vscode/settings.json) and configures:
  ```json
  {
    "objectscript.syncLocalChanges": "vscodeOnly"
  }
  ```
  This cleanly partitions responsibilities:
  - VS Code exclusively uploads files saved directly within editor buffers (`touchedByVSCode`).
  - `iris-sync` processes all external filesystem writes (AI agents, CLI commands, Git checkouts).

---

## 9. Non-Destructive Configuration Handling

Configuration files often contain comments and trailing commas. All reading and editing of JSON files must be strictly non-destructive:
- **Use JSONC Utilities**: Always use [`stripJsonc`](../src/headless/configBridge.ts), [`parseJsoncSafe`](../src/headless/configBridge.ts), and [`setSettingPreservingJsonc`](../src/headless/configBridge.ts) in [`src/headless/configBridge.ts`](../src/headless/configBridge.ts).
- **Surgical Updates**: Never overwrite configuration files with raw `JSON.stringify` calls on parsed objects. Surgical in-place updates preserve user comments, formatting, and non-target keys.
- **Two-Tier Topology**: Respect the resolution precedence:
  1. CLI Flags (`--namespace`, `--server`, etc.)
  2. 12-Factor Environment Variables (`IRIS_HOST`, `IRIS_PORT`, `IRIS_USER`, `IRIS_PASSWORD`, `IRIS_NAMESPACE`)
  3. Local Workspace Config (`.iris-sync/config.json` and `.iris-sync/servers.json`)
  4. Global User Config (`~/.iris-sync/config.json` and `~/.iris-sync/servers.json`)
  5. Fallback: Local VS Code Settings (`.vscode/settings.json`)

---

## 10. Atomic Git Synchronization (`git-sync`)

During Git operations (`checkout`, `pull`, `merge`, `rebase`), hundreds of files change in milliseconds. Naive file watchers cause watcher storms, out-of-order compilation failures, and leave deleted classes running on IRIS.
Use `iris-sync git-sync`:

```bash
iris-sync git-sync --from HEAD@{1} --to HEAD
```

### Pipeline Phases:
1. **Diff Engine**: Runs `git diff --name-status <from> <to> -- <sourceRoot>`.
2. **Purge Phase**: Issues `DELETE /doc/{docName}` for all deleted files (`D` and renamed `R_old`).
3. **Upload Phase**: Batches all added (`A`) and modified (`M`) files using `importFile(..., ignoreConflict=true)`.
4. **Compilation Phase**: Compiles the batch using `actionCompile` with automatic fallback to topological dependency ordering.
5. **Git Hooks**: Automated installation via `iris-sync setup --git-hooks` writes `.git/hooks/post-checkout` and `.git/hooks/post-merge`.

---

## 11. Zero-Conflict Upstream Tracking Protocol

To integrate updates from upstream [`intersystems-community/vscode-objectscript`](https://github.com/intersystems-community/vscode-objectscript):

```bash
# 1. Fetch upstream changes
git fetch upstream master

# 2. Merge upstream cleanly (zero merge conflicts because upstream files are untouched)
git merge upstream/master

# 3. Verify that all VS Code API symbols used by newly merged code are implemented
npm run test:shim

# 4. If missing symbols are reported, implement them in src/headless/vscode-shim.ts

# 5. Build and verify standalone binary
npm run build:cli

# 6. Run end-to-end sanity tests
./dist/cli/iris-sync.js --help
./dist/cli/iris-sync.js dev version
```

---

## 12. Command Reference Cheatsheet

```bash
# Development & Build
npm run build:cli                 # Compile standalone binary via esbuild
npm run watch:cli                 # Watch mode for CLI development
npm run build:extension           # Compile standard VS Code extension
npm run test:shim                 # Run AST parity and shim verification tests

# Execution & Runtime (dist/cli/iris-sync.js or versioned artifact)
./dist/cli/iris-sync.js watch          # Start background watcher daemon
./dist/cli/iris-sync.js watch --coexist # Watcher with coexistence mode configured
./dist/cli/iris-sync.js compile <file> # Synchronize and compile single file
./dist/cli/iris-sync.js pull <file>    # Pull remote document from IRIS to disk
./dist/cli/iris-sync.js diff <file>    # Unified diff between local and remote
./dist/cli/iris-sync.js build --all    # Batch compile entire workspace
./dist/cli/iris-sync.js git-sync       # Atomic Git synchronization & purge
./dist/cli/iris-sync.js setup --git-hooks # Install post-checkout & post-merge hooks
./dist/cli/iris-sync.js ping           # Connection & namespace healthcheck
./dist/cli/iris-sync.js dev version    # Output dual-version breakdown
```
