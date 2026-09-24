# Product Roadmap & Strategic Evolution: `iris-sync`

## Standalone Headless InterSystems IRIS Synchronization & Compiler Engine

---

## 1. Quick Status Glance

> **Legend**:
> - `[x]` **Done**: Completed, verified, and active
> - `[/]` **Doing**: Actively in progress
> - `[ ]` **Backlog**: Planned / Not yet started
> - `[!]` **Impediment / Note**: Blocker, external dependency, or attention required

---

### Phase 1: Foundations & Architecture (Pattern A)
- [x] Atelier REST API reverse-engineering (`/api/atelier/`, `PUT`, `DELETE`, `POST compile`)
- [x] Pattern A: Virtual Runtime Shim (`src/headless/vscode-shim.ts` — zero upstream code modifications)
- [x] Two-tier configuration topology (`.iris-sync/servers.json`, `config.json`) with `.vscode/` fallback
- [x] Remote Draft-07 JSON Schemas (`servers`, `config`, `cache`, `project`) resolving over HTTPS
- [x] Single-file compilation with optimistic locking & deterministic conflict policies (`fail`, `overwrite`, `pull`, `diff`)
- [x] Workspace batch compilation (`iris-sync build --all`) with dependency fallback
- [x] Filesystem watcher with semantic AST storage echo suppression (`iris-sync watch`)
- [x] VS Code coexistence mode (`iris-sync watch --coexist` partitioning editor saves vs. external writes)
- [x] Atomic Git batch compiler (`iris-sync git-sync`) & hook setup (`iris-sync setup --git-hooks`)
- [x] Server profile ingestion from Windows Registry & `.vscode/settings.json` (`setup --from-registry|--from-vscode`)
- [x] Non-destructive JSONC configuration bridge preserving comments & formatting (`iris-sync config sync`)
- [x] Upstream AST contract parity scanner asserting 100% symbol coverage (`iris-sync dev sync-upstream`)
- [x] Standalone build pipeline (`build/esbuild.cli.ts` -> `./dist/cli/`)
- [x] Dual-versioning architecture (`b.<extVersion>-c.<cliVersion>` / `iris-sync dev version`)
- [x] First GitHub Pre-release published (`b.3.8.6-SNAPSHOT-c.0.0.1-ALPHA`) with compiled assets

---

### Phase 2: Studio Projects, Daemonization & Streaming (Completed - v0.2.0)
- [x] **M2.5: Studio Project Parity (`iris-sync project`)**
  - [x] Draft-07 project schema definition (`schemas/irisproject.schema.json`)
  - [x] Local-first manifest tracking (`.iris-sync/projects/<name>.json`)
  - [x] Project management CLI (`project list`, `project create`, `project add`, `project remove`, `project show`)
  - [x] Server `%Studio.Project` manifest bi-directional synchronization (`project sync-manifest`)
  - [x] Project-scoped compilation (`iris-sync compile --project <name>`)
  - [x] Project-scoped file watching (`iris-sync watch --project <name>`)
  - [x] Project export pipeline (XML / UDL bundle export via `%SYSTEM.OBJ.Export` / Atelier API)
  - [x] Direct headless promotion / push-to-prod (`iris-sync project deploy <name> --target <srv> --compile`)
- [x] **M2.1: Background Service Daemonization (`iris-sync daemon`) [Deprioritized / Optional Niche]**
  - > [!NOTE]
    > **Architectural Decision (Entry 013)**: Local OS daemonization is deprioritized in favor of foreground `iris-sync watch`. Daemonization introduces hidden "ghost syncs" during branch rebasing, silent failures without terminal feedback, and zombie process management. The unit generator code is preserved as an optional utility for dedicated headless staging VMs, while foreground execution is the official primary workflow.
  - [x] Linux systemd user/system service generator (`iris-sync daemon install --systemd`)
  - [x] macOS launchd daemon plist generator (`iris-sync daemon install --launchd`)
  - [x] PID file locking (`~/.iris-sync/daemon.pid`) & graceful termination (`iris-sync daemon stop`, `status`)
  - [x] Detached background watcher spawning (`iris-sync daemon start`)
  - [x] Rotating structured JSON & syslog log handlers
- [x] **M2.2: WebSocket Compiler Streaming (`api.atelier.websocket`)**
  - [x] Bidirectional WebSocket client in `src/headless/`
  - [x] Zero-polling real-time compilation console line streaming to stdout
  - [x] Sub-millisecond error notification latency
- [x] **M2.3: Multi-Namespace & Multi-Root Workspace mappings (`mappings` in `config.json`)**
- [x] **M2.4: Standalone Self-Contained Native Binary (Node SEA / Bun compile)**

---

### Phase 3: AI Coding Agent Protocols & Testing Engine (Completed - v0.3.0)
- [x] **M3.1: Model Context Protocol (MCP) Server (`iris-sync mcp`)**
  - [x] `tools/iris_compile` & `tools/iris_query_errors`
  - [x] `tools/iris_inspect` & `tools/iris_eval`
  - [x] `tools/iris_project_export` & `tools/iris_project_deploy`
  - [x] `resources/iris_schema`
- [x] **M3.2: Structured Diagnostic Reporting (`--format=json`, `--format=sarif`)**
- [x] **M3.3: Headless `%UnitTest` Test Runner (`iris-sync test` with JUnit XML & TAP)**

---

### Phase 4: Enterprise CI/CD & Auto-Sync (Current Phase)
- [x] **M4.1: Official CI/CD GitHub Actions & GitLab CI Templates (`ghcr.io/g3labz/iris-sync`)**
- [x] **M4.2: Automated Upstream Parity Bot (weekly sync & PR creation)**
- [ ] **M4.3: Secure Credential Vault Bridge (HashiCorp Vault, AWS/GCP/Azure Secret Managers)**
- [ ] **M4.4: Public Package Registry Publishing (`@g3labz/iris-sync` on npm)**
- [x] **M4.5: Interoperability Production Config Item Lifecycle & Safe BO Hot-Restart (`Ens.Director`)**
  - [x] Preferred primitive: `Do ##class(Ens.Director).RestartHost("ConfigItemName")`
  - [x] Production reload: `Do ##class(Ens.Director).UpdateProduction()`
  - [x] Fallback toggle: disable & re-enable via `##class(Ens.Director).EnableConfigItem("Name", 0|1)`
  - [x] Strictly opt-in execution (never automatic by default) with explicit warnings regarding inflight message queues
  - [x] Dedicated MCP tool (`tools/iris_restart_config_item`) enabling AI agents to await multi-file edits before cycling
  - [x] Target environment requirement: InterSystems IRIS (2023+ recommended) with Interoperability enabled

---

### Current Impediments & Notes `[!]`
- [!] **Interoperability Business Operation in-memory job caching**: When editing Business Operations (BOs), IRIS ties execution to a persistent background `Ens.Job`; newly compiled code does not take effect until the item is cycled (`EnableConfigItem`). Hot-restarts must remain strictly opt-in and cautious to prevent disrupting running message queues.
- [!] **Upstream `package.json` schema limitation**: Upstream extension `package.json` does not recognize `cliVersion`; maintained in our fork root and validated via `build/esbuild.cli.ts`.
- [!] **Standalone SEA single-binary packaging (M2.4)**: Blocked until M2.5 manifest definitions and commands stabilize to avoid premature binary distribution churn.
- [!] **OS Keyring Headless Fallback**: Linux environments without X11/DBus session keyrings require password fallback to environment variables (`IRIS_PASSWORD`) or plaintext config flag.

---

## 2. Backfilled Milestones (Completed Work)

### 2.1 Milestone 1: Reverse-Engineering the IRIS Atelier Protocol (2026-09-12)
- **Problem Statement Identified**: Discovered that existing ObjectScript workflows rely strictly on an active IDE window executing `vscode.workspace.createFileSystemWatcher`. When the IDE is closed or in headless environments, external changes remain unsynchronized.
- **Protocol Discovery**: Reverse-engineered the InterSystems Atelier REST API on web ports 57772/52773 (`GET /api/atelier/`, `PUT /doc/`, `POST /action/compile`, `DELETE /doc/`).
- **Document Identifier Authority**: Formulated the rule that `.cls` document names in IRIS must be resolved from the internal `Class Package.ClassName` statement header rather than merely the local filesystem path.
- **Concurrency & Locking**: Uncovered Atelier's optimistic locking semantics (`IF-NONE-MATCH: <ts>` with `ignoreConflict=0`, `HTTP 409 Conflict`), and formulated deterministic headless resolution strategies (`fail`, `overwrite`, `pull`, `diff`, `merge`).
- **Proof of Concept**: Authored zero-dependency Python prototype (`iris_sync_daemon.py`) verifying raw HTTP/HTTPS Atelier protocol communication.
- **Reference**: Documented in [`EMPIRICISM.md`](EMPIRICISM.md#entry-001-clarification-on-ide-file-watching-vs-headless-synchronization) (Entries 001–004).

---

### 2.2 Milestone 2: Two-Tier Configuration Architecture & Server Ingestion (2026-09-12)
- **Separation of Concerns**: Decoupled Server Registries from Workspace Profiles, providing both Global (`~/.iris-sync/`) and Local (`./.iris-sync/`) scopes, eliminating root clutter and avoiding vendor namespace collision with InterSystems.
- **Draft-07 Schemas**: Authored formal JSON schemas [`schemas/irisservers.schema.json`](../../schemas/irisservers.schema.json) and [`schemas/irisrc.schema.json`](../../schemas/irisrc.schema.json).
- **1:1 Parity with `servermanager`**: Aligned schema strictly with `@intersystems-community/intersystems-servermanager` (`IServerSpec`), allowing server blocks to be copied verbatim.
- **Automated Ingestion**: Implemented importers for legacy Windows Registry hives (`HKCU\Software\InterSystems\Cache\Servers`, `HKLM\...`) and VS Code user/workspace `settings.json`.
- **Zero-Config Compatibility Mode**: Enabled automated fallback to `.vscode/settings.json` (`objectscript.conn` and `intersystems.servers`) when `.iris-sync/config.json` is omitted.
- **Hierarchical Precedence Engine**: Built resolution cascade: CLI flags $\rightarrow$ 12-factor environment variables $\rightarrow$ Local `./.iris-sync/config.json` $\rightarrow$ Global `~/.iris-sync/config.json` $\rightarrow$ `.vscode/settings.json` fallback.
- **Reference**: Documented in [`EMPIRICISM.md`](EMPIRICISM.md#entry-006-two-tier-configuration-topology--windows-registryvs-code-ingestion) (Entries 006–008).

---

### 2.3 Milestone 3: Inter-Tool Coexistence & Concurrency Management (2026-09-12)
- **Double-Watcher Collision Prevention**: Identified race condition hazard when running `iris-sync` while VS Code is open. Solved via automated tuning of `objectscript.syncLocalChanges: "vscodeOnly"`, partitioning in-editor saves to VS Code and headless external writes to `iris-sync`.
- **Compiler Storage Echo Suppression**: Detected recursive compilation bounce loop triggered when IRIS compiler generates updated `<Storage>` XML blocks and writes them back to disk. Implemented semantic AST hashing:
  $$\text{Hash}_{\text{semantic}} = \text{SHA256}(\text{ClassContent} \setminus \text{StorageBlock})$$
  Suppressing watcher events when only compiler-generated storage metadata changes.
- **OS Keyring Bridge**: Documented key derivation structure (`credentialProvider:${serverName}/${user}`) for seamless password sharing between VS Code and headless CLI.
- **Atomic Git Batch Sync (`git-sync`)**: Solved watcher storm and out-of-order compilation issues during `git checkout`, `git pull`, and `git merge`. Created pipeline classifying mutations via `git diff --name-status`, purging deleted classes via `DELETE /doc`, and compiling additions in topological dependency order.
- **Reference**: Documented in [`EMPIRICISM.md`](EMPIRICISM.md#entry-010-inter-tool-state-synchronization--coexistence-architecture) (Entries 010–011).

---

### 2.4 Milestone 4: Architectural Evaluation & Pattern A Selection (2026-09-13)
- **52-File Import Audit**: Audited `vscode-objectscript` and confirmed 52 TypeScript files directly import `from "vscode"`. Core logic (`AtelierAPI`, `importFile()`, `loadChanges()`, `updateStorage()`) depends on `vscode.Uri`, `vscode.workspace.getConfiguration()`, and `workspaceState`.
- **Comparative Assessment**:
  - *Greenfield Rewrite*: Rejected due to high implementation risk, divergence from upstream bugfixes, and difficulty replicating nuanced Atelier protocol edge cases and storage reconciliation.
  - *Pattern B (Core/Adapter Decoupling)*: Rejected due to severe Git merge conflict surfaces on future upstream releases caused by invasive refactoring.
  - *Pattern A (Virtual Runtime Shim)*: **Selected as authoritative architecture**. Aliases `"vscode"` at build time (`esbuild --alias:vscode=./src/headless/vscode-shim.ts`) to provide headless implementations of `workspace`, `window`, `Uri`, and `workspaceState`. Requires **zero modifications to upstream code**.
- **Dual-Target Build Pipeline**: Configured `package.json` with `build:extension` (Webpack) and `build:cli` (esbuild), using aggressive tree-shaking to strip webviews and TextMate syntaxes.
- **Reference**: Documented in [`EMPIRICISM.md`](EMPIRICISM.md#entry-012-architectural-evaluation-of-fork--headless-cli-layer-vs-greenfield-tool) (Entry 012).

---

### 2.5 Milestone 5: Forking, Implementation & Live Sandbox Verification (2026-09-14)
- **GitHub Organizations & Fork Creation**: Forked [`intersystems-community/vscode-objectscript`](https://github.com/intersystems-community/vscode-objectscript) and [`intersystems-community/intersystems-servermanager`](https://github.com/intersystems-community/intersystems-servermanager) to [`G3Labz`](https://github.com/G3Labz) on GitHub.
- **Virtual Runtime Shim (`src/headless/vscode-shim.ts`)**: Implemented complete headless compatibility layer supporting `Uri` (`vscode-uri`), `workspace` (`getConfiguration`, `fs`, `asRelativePath`, `workspaceFolders`), `window` (`createOutputChannel`, `showErrorMessage`, `withProgress`), `workspaceState` / `HeadlessMemento`, `commands`, and `EventEmitter`.
- **Non-Destructive JSONC Bridge (`src/headless/configBridge.ts`)**: Built `stripJsonc`, `parseJsoncSafe`, and `setSettingPreservingJsonc` ensuring developer comments and trailing commas in `.vscode/settings.json` are preserved during configuration synchronization.
- **Document Resolution Hardening**: Hardened `CLASS_REGEX` supporting `%` system classes, unicode letters, package dots, and underscores (`_`). Implemented category folder stripping (`cls/`, `mac/`, `inc/`, `routines/`, `rtn/`).
- **Standalone Binary Generation**: Authored `build/esbuild.cli.ts`, compiling self-contained executable binary into `dist/cli/iris-sync-b.<ext>-c.<cli>.js` (and canonical alias `dist/cli/iris-sync.js`).
- **Test Suite**: Developed 32 unit and integration tests across 9 suites in [`test/shim.test.ts`](../../test/shim.test.ts), including static AST scanning across 64 upstream files and 148 symbols (100% coverage).
- **Live Sandbox Verification**: Verified connection, ping, diff, single-file compilation, and batch build against an active InterSystems IRIS 2026.2 container running in `IrisSandbox`.
- **Agent Specification & Rules**: Authored [`../../.agents/iris-sync_dev.md`](../../.agents/iris-sync_dev.md) and [`../../.workflows/iris-sync_rules.md`](../../.workflows/iris-sync_rules.md).

---

## 3. Current State & Feature Matrix

| Capability | CLI Command | Status | Description |
| :--- | :--- | :--- | :--- |
| **Server Healthcheck** | `iris-sync ping` | **Production Ready** | Queries `/api/atelier/`, reports server version, API version, and active namespaces. |
| **Single-File Sync** | `iris-sync compile <file>` | **Production Ready** | Uploads document with optimistic locking and triggers compiler flags (`cuk`). |
| **Server vs Local Diff** | `iris-sync diff <file>` | **Production Ready** | Fetches remote UDL source and generates colorized unified diff in terminal. |
| **Pull Remote Code** | `iris-sync pull <file>` | **Production Ready** | Downloads server version and updates local disk file. |
| **Batch Workspace Build**| `iris-sync build --all` | **Production Ready** | Discovers all source files and compiles in batch with topological fallback. |
| **Filesystem Watcher** | `iris-sync watch` | **Production Ready** | Chokidar-driven file watcher with debouncing and semantic AST echo suppression. |
| **Coexistence Mode** | `iris-sync watch --coexist`| **Production Ready** | Configures `objectscript.syncLocalChanges: "vscodeOnly"` to avoid IDE collisions. |
| **Atomic Git Sync** | `iris-sync git-sync` | **Production Ready** | Classifies Git changes, deletes server artifacts for purged files, and batches uploads. |
| **Git Hook Setup** | `iris-sync setup --git-hooks`| **Production Ready** | Installs `post-checkout` and `post-merge` hooks for automated branch sync. |
| **Registry Importer** | `iris-sync setup --from-registry`| **Production Ready** | Ingests server profiles from Windows Registry (HKCU/HKLM) into local catalogs. |
| **VS Code Importer** | `iris-sync setup --from-vscode`| **Production Ready** | Reads `intersystems.servers` and `objectscript.conn` from `.vscode/settings.json`. |
| **Bidirectional Sync** | `iris-sync config sync` | **Production Ready** | Reconciles server entries between `.iris-sync/servers.json` and `.vscode/settings.json`. |
| **AST Parity Scanner** | `iris-sync dev sync-upstream`| **Production Ready** | Scans 64 upstream files and asserts 100% shim coverage for all `vscode.*` symbols. |
| **Version Matrix**     | `iris-sync dev version`      | **Production Ready** | Inspects dual-version matrix (extension base `b`, CLI build `c`, composite tag, artifact filename). |

### 3.1 Dual-Versioning & Release Architecture (`b.<extVersion>-c.<cliVersion>`)

Because `iris-sync` is delivered as a fork and standalone compiler layer over the upstream `vscode-objectscript` extension, it must track two distinct evolutionary lifecycles:

```
                      Composite Version Identifier
                ┌──────────────────────────────────────┐
                │   b.3.8.6-SNAPSHOT-c.0.0.1-ALPHA     │
                └──────────────────┬───────────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
   Upstream Extension Build               Standalone CLI Build
   - package.json: version                - package.json: cliVersion
   - Tracks InterSystems core             - Tracks iris-sync tooling,
     (Atelier client, compiler,             watcher, daemon, schemas,
     language features)                     project parity & CI/CD
   - Prefix: b.<version>                  - Prefix: c.<version>
```

1. **Upstream Extension Version (`b`)**: Follows `package.json:version` (e.g., `3.8.6-SNAPSHOT`). When upstream bumps, `iris-sync` automatically tracks the new base.
2. **CLI Engine Version (`c`)**: Follows `package.json:cliVersion` (e.g., `0.0.1-ALPHA`, `0.1.0-BETA`, `1.0.0`), supporting independent semver progression with stability qualifiers (`ALPHA`, `BETA`, `SNAPSHOT`, `RC`).
3. **Release Tag Format**: `b.<extVersion>-c.<cliVersion>` (e.g., `b.3.8.6-SNAPSHOT-c.0.0.1-ALPHA`).
4. **Binary Location**: Compiled directly into `./dist/cli/iris-sync-b.<extVersion>-c.<cliVersion>.js` (replacing legacy `./bin/`), alongside a canonical convenience alias `./dist/cli/iris-sync.js`.
5. **Future Automated CI/CD Trigger**: GitHub Actions watches for upstream release tags; upon an upstream bump, it automatically packages, tags, and publishes the dual-versioned standalone binaries.

---

## 4. Future Goals & Roadmap Milestones

```
Timeline Overview:
2026 Q3 (Current): Phase 1 (Completed) -> Phase 2 (Underway)
2026 Q4: Phase 3 (AI Agent Protocols & Unit Testing)
2027 Q1: Phase 4 (Enterprise CI/CD & Autonomous Maintenance)
```

### 4.1 Phase 2: Production Daemonization, Studio Projects & Streaming (Near-Term)

- [x] **M2.1: Background Service Daemonization (`iris-sync daemon`) [Deprioritized / Optional Niche]**
  - **Status**: Implemented but deprioritized for core developer workflows (see [EMPIRICISM.md Entry 013](EMPIRICISM.md#entry-013-developer-experience-invariant--foreground-interactive-watch-vs-background-os-daemonization)).
  - **Rationale**: Local OS daemons create "ghost sync" hazards (silently compiling during git rebases), invisible socket/auth failures, and require manual process hunting. Modern developer tooling (e.g. `tsc --watch`, `cargo watch`, `esbuild`) favors foreground execution with immediate visual feedback and deterministic `Ctrl+C` lifecycle.
  - Preserved capabilities for headless staging servers:
    - Linux systemd user service generator (`iris-sync daemon install --systemd`).
    - macOS launchd daemon plist generator (`iris-sync daemon install --launchd`).
    - PID file locking (`~/.iris-sync/daemon.pid`), status monitoring, and graceful termination.

- [ ] **M2.2: WebSocket Compiler Streaming (`api.atelier.websocket`)**
  - Atelier API v1+ supports upgrading HTTP to a bidirectional WebSocket (`/api/atelier/v1/{namespace}/websocket`).
  - Implement WebSocket streaming client in `src/headless/` to stream real-time compilation console lines directly to stdout without polling.
  - Sub-millisecond latency for compiler error notifications on large multi-class compilations.

- [x] **M2.3: Multi-Namespace & Multi-Root Workspace Support**
  - Allow `.iris-sync/config.json` to define folder-to-namespace mappings:
    ```json
    {
      "mappings": [
        { "dir": "src/core", "namespace": "CORE", "server": "dev" },
        { "dir": "src/billing", "namespace": "BILLING", "server": "dev" }
      ]
    }
    ```
  - Single watcher process dispatching events across multiple target namespaces concurrently.

- [x] **M2.4: Standalone Self-Contained Binary Distribution**
  - Package `iris-sync` as a zero-dependency native binary (using Node.js Single Executable Applications - SEA, or Bun compile):
    - `iris-sync-linux-x64`
    - `iris-sync-linux-arm64`
    - `iris-sync-macos-arm64`
    - `iris-sync-windows-x64.exe`
  - Eliminates the requirement for end-users to have Node.js or npm installed.

- [ ] **M2.5: Studio Project Parity, Tracked File Sets & Promotion/Export Pipeline (`iris-sync project`)**
  - **Problem Statement & Legacy Studio Parity**:
    - In InterSystems IRIS Studio, the **Projects** feature (`.PRJ` documents stored internally in `%Studio.Project`) allows developers to define a named, curated manifest of files/documents (classes `.cls`, routines `.mac`, includes `.inc`, and web assets `.csp`).
    - Historically, the most vital capability of Studio Projects was **deployment promotion**: when preparing to push to production or staging servers, developers exported the project package (via `%SYSTEM.OBJ.Export` as an XML or UDL bundle) and imported it into the target server environment without needing to deploy the entire codebase or database.
    - In the VS Code ObjectScript extension (`vscode-objectscript`), project management is tightly coupled to virtual `isfs://` workspace folders (`isfs://<server>:<namespace>?project=<name>`). In local filesystem development (`file://` mode) and headless CI/CD operations, developers have had no mechanism to define, track, scope, or export Studio-like projects without mounting remote virtual filesystems.
  - **Local-First Project Manifest Tracking (`.iris-sync/projects/<name>.json`)**:
    - Implement local project definitions stored under `./.iris-sync/projects/` allowing developers to define and track specific file sets offline:
      ```json
      {
        "name": "BillingService",
        "description": "Invoice reconciliation and payment webhook handlers",
        "serverProject": "BillingService.PRJ",
        "items": [
          "src/cls/App/Billing/Invoice.cls",
          "src/cls/App/Billing/PaymentService.cls",
          "src/mac/UTILBILLING.mac",
          "src/inc/BillingDef.inc"
        ]
      }
      ```
    - Provide intuitive CLI management commands:
      - `iris-sync project list`: Enumerate locally configured projects in `./.iris-sync/projects/` and query remote server `%Studio.Project` catalogs.
      - `iris-sync project create <name> [--desc "Description"]`: Initialize a new project definition locally in `./.iris-sync/projects/<name>.json` and optionally register the `.PRJ` document on the active server.
      - `iris-sync project add <name> <file...>`: Add one or more local files or classes to the named project manifest.
      - `iris-sync project remove <name> <file...>`: Remove files from the project manifest.
      - `iris-sync project sync-manifest <name>`: Bi-directionally synchronize the project definition between local `./.iris-sync/projects/<name>.json` and the server's `%Studio.Project` / `%Studio.Project_ProjectItemsList`.
  - **Project-Scoped Compilation & File Watching**:
    - Restrict sync and watch operations to the specific files belonging to the project:
      - `iris-sync compile --project <name>`: Compile only files declared in the project, honoring topological dependency ordering.
      - `iris-sync watch --project <name>`: Scope the Chokidar filesystem watcher strictly to the project's file list, ignoring all unrelated repository modifications.
      - `iris-sync diff --project <name>`: Compare all files in the project against their server-side counterparts.
  - **Project Export & Multi-Server Promotion Pipeline ("Push to Prod")**:
    - Provide a headless, automated alternative to the legacy Studio manual export/import workflow:
      - **Export Distribution Bundle**:
        ```bash
        # Export project items as an InterSystems XML deployment package
        iris-sync project export <name> --output dist/BillingService-v1.0.xml --format xml

        # Export as a structured UDL directory package
        iris-sync project export <name> --output dist/BillingService/ --format udl
        ```
        Generates clean, deployable distribution artifacts containing all classes, routines, and metadata declared in the project manifest.
      - **Direct Headless Promotion / Deploy**:
        ```bash
        # Deploy project files directly from local workspace or source server to production
        iris-sync project deploy <name> --target prod --namespace PROD_APP --compile --flags cuk
        ```
        Eliminates the manual Studio export → transfer → import ceremony by orchestrating an atomic upload and compilation of all project artifacts to remote staging or production environments.
      - **Import / Package Ingestion**:
        ```bash
        iris-sync project import dist/BillingService-v1.0.xml --target prod --compile
        ```
        Ingests and compiles exported project packages on target servers headlessly.

---

### 4.2 Phase 3: AI Coding Agent Protocols & Testing Engine (Mid-Term)

- [x] **M3.1: Model Context Protocol (MCP) Server Integration**
  - Implement an integrated MCP server within `iris-sync` (`iris-sync mcp`) allowing AI coding agents (Antigravity, Claude Code, Cursor, Copilot) to interact directly with the IRIS server:
    - `tools/iris_compile`: Synchronize and compile one or more classes.
    - `tools/iris_inspect`: Inspect server classes, properties, methods, and routine definitions.
    - `tools/iris_query_errors`: Retrieve structured syntax and compilation diagnostics.
    - `tools/iris_eval`: Safely execute one-line ObjectScript commands in a sandboxed namespace.
    - `tools/iris_project_export`: Package and export project items for distribution.
    - `tools/iris_project_deploy`: Deploy project file sets across environments.
    - `resources/iris_schema`: Provide live database class schemas as context for LLM code generation.

- [ ] **M3.2: Structured Diagnostic Reporting (SARIF / JSON)**
  - Add `--format=json` and `--format=sarif` to `iris-sync compile` and `iris-sync build`.
  - Parse compiler error messages into machine-readable diagnostics (file path, line number, column, error code, explanation) for autonomous agent automated repair loops.

- [ ] **M3.3: Headless `%UnitTest` Test Runner (`iris-sync test`)**
  - Integrate with the InterSystems `%UnitTest.Manager` framework:
    - Execute test suites directly from CLI:
      ```bash
      iris-sync test --package MyTests --verbose
      ```
    - Output test results in standard JUnit XML, TAP, or human-readable colorized terminal output.
    - Non-zero process exit code on test suite failures for CI/CD gating.

---

### 4.3 Phase 4: Enterprise CI/CD & Automated Upstream Tracking (Long-Term)

- [x] **M4.1: Official CI/CD GitHub Actions & GitLab CI Templates**
  - Release pre-built GitHub Actions supporting workspace and project-scoped promotion:
    ```yaml
    - uses: g3labz/iris-sync-action@v1
      with:
        server: ${{ secrets.IRIS_PROD_HOST }}
        namespace: PROD_APP
        project: BillingService
        action: deploy
        flags: "cuk"
    ```
  - Docker container images published to GitHub Container Registry (`ghcr.io/g3labz/iris-sync:latest`).

- [x] **M4.2: Automated Upstream Parity Bot**
  - Scheduled GitHub Action in `vscode-objectscript`:
    - Automatically checks `upstream/master` on `intersystems-community/vscode-objectscript` weekly.
    - Executes `npm run test:shim` against upstream changes.
    - If clean, creates an automated PR merging upstream.
    - If new `vscode.*` APIs are detected, creates an issue with the missing AST symbol list and assigns `iris-sync_dev`.

- [ ] **M4.3: Secure Credential Vault Bridge**
  - Support enterprise secret stores for headless compilation:
    - HashiCorp Vault integration.
    - AWS Secrets Manager / GCP Secret Manager / Azure Key Vault.
    - Direct Linux `secret-tool` / `libsecret` headless execution without interactive GUI prompts.

- [ ] **M4.4: Public Package Registry Publishing**
  - Publish `@g3labz/iris-sync` to npm with automatic CLI binary executable linking (`npx @g3labz/iris-sync watch`).

- [x] **M4.5: Interoperability Production Config Item Lifecycle & Safe BO Hot-Restart (`Ens.Director`)**
  - **Problem Statement (Persistent Process Caching in IRIS Interoperability)**:
    - In InterSystems IRIS Interoperability productions, Business Operations (BOs), Business Processes (BPs), and Business Services (BSs) are managed as dedicated background jobs (`Ens.Job`).
    - When a developer or AI agent edits and compiles a Business Operation class, IRIS keeps the worker job alive in memory. The running job retains the old cached routine/class in its memory segment, continuing to execute obsolete logic until the host process is restarted.
  - **Programmatic Restart Primitives**:
    - **Host-Level Graceful Restart (Preferred)**:
      ```objectscript
      Do ##class(Ens.Director).RestartHost("YourBusinessOperationName")
      ```
      Directly restarts the specific Business Operation/Service/Process host process without toggling configuration state, spinning up a fresh worker job with the newly compiled code.
    - **Production Reload / Refresh**:
      ```objectscript
      Do ##class(Ens.Director).UpdateProduction()
      ```
      Reloads running production items and applies updated settings and compiled code across all managed hosts.
    - **State Toggle Fallback**:
      ```objectscript
      set tSC = ##class(Ens.Director).EnableConfigItem("YourBusinessOperationName", 0)
      set tSC = ##class(Ens.Director).EnableConfigItem("YourBusinessOperationName", 1)
      ```
      Toggling the config item from `0` (disabled) to `1` (enabled) cleanly terminates the existing worker process, spins up a fresh `Ens.Job`, and reloads the newly compiled code into memory.
  - **Safety Invariant (Strictly Opt-In, Caution Advised)**:
    - > [!CAUTION]
      > **Production Risk Warning**: Hot-restarting a Business Operation while messages are actively inflight can cause message queue stalling, interrupted socket/database transactions, connection drops, or retry storms. Things can quickly "go sideways" if triggered blindly.
    - **Never Automatic by Default**: This restart flow **must not** be executed automatically upon general file saves or watch events unless the developer explicitly flags it (e.g., `--restart-item <name>` or workspace config `"restartOnCompile": false`).
    - The CLI must output clear warning prompts informing the developer of the active restart risk.
  - **AI Coding Agent Integration (MCP Tool: `tools/iris_restart_config_item`)**:
    - AI agents working on complex BO modifications often need to edit multiple methods or helper classes before the code is functionally coherent.
    - Expose `tools/iris_restart_config_item` on the `iris-sync mcp` server. This enables the agent to complete all intermediate code adjustments, verify compiler diagnostics via `tools/iris_compile`, and only *then* programmatically invoke `RestartHost` once the entire change set is finalized.
  - **Compatibility & Platform Caveats**:
    - Requires InterSystems IRIS (2023+ recommended) with an active Interoperability production and Atelier / Lite Terminal terminal execution permissions.

---

## 5. Architectural Invariants & Guiding Principles

As `iris-sync` evolves, all future contributors and AI agents must preserve the core design principles established in Milestone 4:

1. **Strict Upstream Code Isolation (Pattern A)**:
   Never modify upstream files in `src/api/`, `src/commands/`, `src/utils/`, `src/providers/`, `src/debug/`, `src/explorer/`, or `src/extension.ts`. All enhancements must be implemented within `src/headless/` and bridged through `src/headless/vscode-shim.ts`.
2. **Deterministic Automation Over Interactive Blocking**:
   Headless operations must never hang on modal dialogs. Every prompt must have a deterministic CLI flag fallback (`--conflict fail`, `--conflict overwrite`, etc.).
3. **Zero Configuration Drift**:
   Maintain 1:1 schema compatibility with `~/.iris-sync/servers.json` and VS Code's `intersystems.servers` (`IServerSpec`).
4. **Non-Destructive Configuration Updates**:
   Preserve comments, formatting, and trailing commas in `.vscode/settings.json` and JSON files using `parseJsoncSafe` and `setSettingPreservingJsonc`.
5. **Class Header Authority**:
   Never assume filename equals class name. The internal `Class Package.ClassName` statement is the single authoritative source of truth.
