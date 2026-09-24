# Empiricism & Architectural Findings

## Entry 001: Clarification on IDE File Watching vs. Headless Synchronization

- **Date**: 2026-09-12
- **Finding**: The limitation in existing InterSystems IRIS development workflows is not that file changes require manual `Ctrl + S` per file when the IDE is active; the IDE's file watcher (`vscode.workspace.createFileSystemWatcher`) detects external filesystem alterations when running. Rather, the limitation is the mandatory lifecycle dependency on an active, running VS Code / Antigravity IDE instance.
- **Root Cause**: Inaccurate description in Section 1.1 asserted that the IRIS server remains unaware of external file changes until each file is manually focused and saved (`Ctrl + S`). This conflated editor buffer save events with workspace filesystem watcher behavior, failing to identify that the true barrier is headless execution (absence of an active IDE process).
- **Resolution**: Corrected [headless-iris-sync-compiler-guide.md](headless-iris-sync-compiler-guide.md#L11-L16) to accurately document that:
  1. The IDE extension file watcher detects external file changes only while the IDE process is actively running.
  2. In headless environments (CI/CD, CLI scripting, background containers, or when the IDE is closed), the watcher is absent, preventing synchronization to the IRIS server.

## Entry 002: Document Identifier Resolution Authority & Environment Sanitization

- **Date**: 2026-09-12
- **Finding**:
  1. Monitored source directories must be configurable in tooling, defaulting to `src/`.
  2. For ObjectScript classes (`.cls`), the authoritative IRIS document identifier is defined by the internal `Class Package.ClassName` statement in the file content, not exclusively the relative disk path.
  3. Documentation and reference implementations must never contain proprietary organization identifiers, project names, internal IP ranges, or hardcoded credentials.
- **Root Cause**: Section 1.2 and Section 4.1 assumed strict 1:1 path-to-document equivalence, hardcoded a non-configurable source root, and included proprietary codebase identifiers and internal connection endpoints.
- **Resolution**: Updated [headless-iris-sync-compiler-guide.md](headless-iris-sync-compiler-guide.md) to:
  1. Specify configurable directory watching defaulting to `src/`.
  2. Incorporate AST/regex header parsing (`^\s*Class\s+([A-Za-z0-9\._]+)`) for `.cls` files with path-based normalization as fallback.
  3. Sanitize all namespaces, class examples, endpoints, and credentials across configuration schemas, prototypes, and CLI examples.

## Entry 003: Atelier Concurrency Control & Headless Conflict Resolution

- **Date**: 2026-09-12
- **Finding**:
  1. Atelier REST API implements optimistic concurrency via `PUT /doc/{docName}?ignoreConflict=0` with `IF-NONE-MATCH: <server-timestamp>`. If the server document timestamp has diverged, the API responds with `HTTP 409 Conflict`.
  2. The GUI extension `vscode-objectscript` resolves conflicts interactively by presenting modal actions: "Pull Server Changes" (`GET /doc/{docName}` overwriting disk), "Overwrite on Server" (`PUT ...?ignoreConflict=1`), and "Compare" (`vscode.diff`).
  3. Headless utilities and background daemons lack interactive dialogs and require deterministic policies (`fail`, `overwrite`, `pull`, `diff`, `merge`) alongside local timestamp caching (`.iris-sync/cache.json`).
- **Root Cause**: Initial architectural design unconditionally passed `ignoreConflict=1` on all PUT requests, removing concurrency protection and risking silent overwrites of concurrent server modifications.
- **Resolution**:
  1. Documented optimistic locking (`IF-NONE-MATCH`, `ignoreConflict=0` vs `1`, `HTTP 409`) in [Section 2](headless-iris-sync-compiler-guide.md#L45-L75).
  2. Added Section 4.2 (State Tracking) and Section 4.3 (Conflict Resolution Strategies: Fail, Overwrite, Pull, Diff, 3-Way Merge).
  3. Enhanced the Python reference prototype in [Section 5](headless-iris-sync-compiler-guide.md#L200-L290) to handle HTTP 409 and execute configurable resolution policies.
  4. Added `--conflict` CLI flags and `iris-sync pull` / `iris-sync diff` commands in [Section 8](headless-iris-sync-compiler-guide.md#L430-L450).

## Entry 004: Mermaid Sequence Diagram Lexer and Block Nesting Integrity

- **Date**: 2026-09-12
- **Finding**:
  1. Each `opt` block in Mermaid sequence diagrams requires its own explicit `end` statement before starting a subsequent `opt` block within the same parent block. Omitting `end` causes nested block state retention, preventing parent `alt`/`else` blocks from terminating properly.
  2. Raw unescaped JSON strings containing braces (`{}`) and brackets (`[]`) directly in arrow labels trigger Mermaid lexer parse errors. Complex payload definitions should be placed inside `Note` annotations or simplified into descriptive text.
- **Root Cause**: An unclosed `opt Overwrite` block and unescaped JSON payloads on arrow message labels caused the sequence diagram parser in Section 2.1 to crash with a parse error expecting block closure tokens.
- **Resolution**: Fixed [Section 2.1](headless-iris-sync-compiler-guide.md#L37-L72) by adding explicit `end` tags to both `opt` blocks, properly terminating the parent `alt` block, and converting arrow labels to clean descriptive text while moving JSON schemas into notes.

## Entry 005: Extension Triad Functional Boundaries & Decoupling Architecture

- **Date**: 2026-09-12
- **Finding**:
  1. The VS Code / Open VSX InterSystems suite is split across three distinct packages:
     - `intersystems-community.vscode-objectscript`: Sync and compilation engine over Atelier REST API.
     - `intersystems-community.servermanager`: Server connection registry and SecretStorage OS keychain credential broker.
     - `intersystems.language-server`: In-memory LSP for editor features (IntelliSense, hover, AST diagnostics).
  2. `iris-sync` directly replaces `vscode-objectscript` by decoupling the compilation/sync pipeline from the editor lifecycle.
  3. `iris-sync` decouples from `servermanager` by adopting 12-factor environment variables and `.iris-sync/config.json` as primary configuration, retaining read-only fallback to `intersystems.servers` in `.vscode/settings.json`.
  4. `intersystems.language-server` is entirely stateless with respect to the database server and does not perform code synchronization or compilation. It is deliberately excluded from `iris-sync` and deferred to a dedicated future project, keeping the headless compiler engine lightweight and self-contained.
- **Root Cause**: Earlier documentation treated the VS Code extension ecosystem as a monolith without delineating between credential brokering, synchronization/compilation, and language server protocols.
- **Resolution**: Added Section 6.1 through 6.5 in [headless-iris-sync-compiler-guide.md](headless-iris-sync-compiler-guide.md#L471-L557), including comparative responsibility matrices, architecture diagrams, and credential fallback chains.

## Entry 006: Two-Tier Configuration Topology & Windows Registry/VS Code Ingestion

- **Date**: 2026-09-12
- **Finding**:
  1. InterSystems legacy desktop client tools (Studio, Terminal, Launcher) store server definitions in the Windows Registry under `HKCU\Software\InterSystems\Cache\Servers`, `HKLM\Software\InterSystems\Cache\Servers`, and `HKLM\Software\WOW6432Node\InterSystems\Cache\Servers`. The extracted fields are `Address`, `WebServerAddress`, `WebServerPort`, `WebServerInstanceName`, `HTTPS`, `Comment`, and `Server User Name`.
  2. VS Code InterSystems extensions store server definitions in user settings (`settings.json`) under `intersystems.servers` and workspace bindings under `objectscript.conn`.
  3. Decoupling configuration from VS Code requires a two-tier global vs. local topology separating server registries (`servers.json`) from runtime project preferences (`config.json`):
     - Global: `~/.iris-sync/servers.json` and `~/.iris-sync/config.json`.
     - Local: `./.iris-sync/servers.json` and `./.iris-sync/config.json`.
- **Root Cause**: Initial configuration models mixed server connection definitions with workspace-specific compilation options in a single file and lacked automated ingestion from existing workstation registries and IDE settings.
- **Resolution**: Revised [Section 3](headless-iris-sync-compiler-guide.md#L97-L200) to specify the two-tier topology, documented Windows Registry and VS Code importer workflows, added schema specifications for `servers.json` and `config.json`, and added setup commands to [Section 8.2](headless-iris-sync-compiler-guide.md#L735-L750).

## Entry 007: Bidirectional VS Code Configuration Parity & Zero-Config Mode

- **Date**: 2026-09-12
- **Finding**:
  1. To eliminate setup friction, `iris-sync` must operate in **Zero-Config Compatibility Mode** when executed within a standard VS Code ObjectScript workspace containing `.vscode/settings.json`, automatically mapping `objectscript.conn` and `objectscript.export` without requiring separate `.iris-sync/config.json` generation.
  2. Server definitions in `.iris-sync/servers.json` must strictly match the `IServerSpec` interface implemented by `intersystems-community.servermanager` (`webServer.host`, `port`, `scheme`, `pathPrefix`, `username`, `description`), enabling direct copy-paste and programmatic synchronization between tools.
- **Root Cause**: Fragmented configuration formats would force developers to duplicate server connection properties across CLI and GUI workflows.
- **Resolution**: Added Section 3.5 to [headless-iris-sync-compiler-guide.md](headless-iris-sync-compiler-guide.md#L225-L265) defining 1:1 key mapping from `.vscode/settings.json`, `IServerSpec` schema equivalence, and bidirectional export commands.

## Entry 008: Tooling Schema Definition & Local URI Resolution

- **Date**: 2026-09-12
- **Finding**:
  1. Configuration specifications must not reference third-party vendor repositories (e.g. `intersystems-community`) for tooling-specific schemas.
  2. The JSON Schema draft-07 definitions for `iris-sync` belong to this repository's project structure under `schemas/`.
  3. Configurations reference these definitions via local relative paths (`"$schema": "./schemas/irisservers.schema.json"`, `"$schema": "./schemas/irisrc.schema.json"`) or package-relative paths when distributed.
- **Root Cause**: Third-party GitHub URLs were inadvertently referenced instead of packaging the schemas within the project's own codebase.
- **Resolution**: Created [irisservers.schema.json](../../schemas/irisservers.schema.json) and [irisrc.schema.json](../../schemas/irisrc.schema.json) under `schemas/`, and updated Section 3.3 and 3.4 in [headless-iris-sync-compiler-guide.md](headless-iris-sync-compiler-guide.md#L160-L215) to reference the local definitions.

## Entry 009: Repository Link Portability & Environment Privacy Sanitization

- **Date**: 2026-09-12
- **Finding**: Absolute local system paths (`file:///home/...`) embedded in documentation expose environment-specific usernames and break links when the repository is cloned, moved, or opened on another workstation.
- **Root Cause**: Assistant tool automation generated absolute filesystem URIs referencing `/home/<user>/...` instead of repository-relative Markdown links.
- **Resolution**: Replaced all absolute filesystem URIs across documentation with repository-relative paths (`../../schemas/...`, `headless-iris-sync-compiler-guide.md`) and logged the requirement for strict relative path referencing.

## Entry 010: Inter-Tool State Synchronization & Coexistence Architecture

- **Date**: 2026-09-12
- **Finding**:
  1. Simultaneous execution of `iris-sync watch` and `vscode-objectscript` causes a double-watcher race condition where external disk writes trigger concurrent `PUT /doc/{name}` requests, yielding `HTTP 409 Conflict` errors and interrupting IDE users.
  2. `vscode-objectscript` includes a built-in configuration key `objectscript.syncLocalChanges` (`"all"` | `"vscodeOnly"` | `"none"`). Setting this to `"vscodeOnly"` partitions responsibilities: VS Code exclusively handles in-editor saves (`storeTouchedByVSCode`), while `iris-sync` processes external filesystem modifications (AI agents, Git branch checkouts, CLI scripts).
  3. Server-side compilation of `.cls` classes regenerates `<Storage>` XML blocks, which `vscode-objectscript` writes back to disk. Without semantic AST hashing (`ClassContent \ StorageBlock`), this disk write triggers an infinite recompilation bounce loop.
  4. Server definitions and credentials require bidirectional synchronization: `iris-sync` watches `.vscode/settings.json` for live connection updates, provides `iris-sync config sync`, and bridges to OS Keyring credentials stored by `intersystems-community.servermanager` (`credentialProvider:${serverName}/${user}`).
- **Root Cause**: Tooling previously operated as an isolated standalone utility without formal coordination protocols for mixed developer environments where VS Code and CLI utilities run concurrently.
- **Resolution**: Added Section 6.6 to [headless-iris-sync-compiler-guide.md](headless-iris-sync-compiler-guide.md) establishing the three-dimension synchronization framework (Registry, Credential Bridge, and Concurrency Coexistence), documented `objectscript.syncLocalChanges` tuning, specified storage echo suppression, and added coexistence CLI commands to Section 8.2.

## Entry 011: Git Repository Batch Synchronization & Upstream Tracking Protocol

- **Date**: 2026-09-12
- **Finding**:
  1. Standard filesystem watchers break during Git operations (`checkout`, `pull`, `merge`, `stash`). Bulk file mutations overwhelm the IRIS Web Gateway with concurrent HTTP requests, induce out-of-order compilation errors (`#1026: Class does not exist`), and leave obsolete deleted classes active on the IRIS server.
  2. Resolving Git repository changes requires an atomic batch pipeline: classifying mutations via `git diff --name-status`, issuing batch deletion requests (`DELETE /docs`) for removed classes, and compiling modified classes in topological inheritance order via a single `POST /action/compile` payload.
  3. Upstream repository evolution in `intersystems-community/vscode-objectscript` and `intersystems-community/intersystems-servermanager` requires contract monitoring against local reference clones (`docs/vscode-objectscript`, `docs/intersystems-servermanager`), tracking interface changes across `src/api/index.ts`, `src/commands/compile.ts`, and `IServerSpec`.
- **Root Cause**: Reliance on per-file filesystem events failed to model atomic repository-level state changes caused by version control systems, and lacked formal tracking of upstream dependency changes.
- **Resolution**: Added Section 6.6.6 (Upstream Tracking Protocol) and Section 7.1 (Git Repository Changes & Atomic Batch Synchronization) to [headless-iris-sync-compiler-guide.md](headless-iris-sync-compiler-guide.md), specified Git hook integration, and added `iris-sync git-sync` and `iris-sync dev sync-upstream` to Section 8.2.

## Entry 012: Architectural Evaluation of Fork + Headless CLI Layer vs. Greenfield Tool

- **Date**: 2026-09-13
- **Finding**:
  1. The existing extension codebase (`vscode-objectscript`) contains 52 files directly importing `from "vscode"`. Core logic (including `AtelierAPI`, `importFile()`, and `updateStorage()`) relies on `vscode.Uri`, `vscode.workspace.getConfiguration()`, and `workspaceState`.
  2. Forking the repositories to add a CLI layer can be implemented via two distinct patterns:
     - **Pattern A (Virtual Runtime Shim)**: Alias the `vscode` module at build time (`esbuild --alias:vscode=./src/headless/vscode-shim.ts`) to provide headless implementations of `workspace`, `window`, `Uri`, and `workspaceState`. This requires zero modifications to upstream code, eliminating Git merge conflicts during upstream synchronization.
     - **Pattern B (Core / Adapter Decoupling)**: Refactor upstream into `@intersystems/core` with separate CLI and extension adapters. While architecturally cleaner, it introduces high merge conflict surfaces on future upstream releases.
  3. A dual-target build system (`build:extension` vs `build:cli`) with tree-shaking enables compiling a lightweight standalone CLI binary from the same repository while stripping out editor UI webviews and textmate grammars.
- **Root Cause**: Architectural inquiry evaluated whether forking and layering a CLI over existing extensions delivers superior upstream maintenance and protocol compatibility compared to a greenfield tool.
- **Resolution**: Formulated comparative feasibility assessment, selected Pattern A (Virtual Runtime Shim) as the authoritative architecture, and updated [headless-iris-sync-compiler-guide.md](headless-iris-sync-compiler-guide.md) across [Section 1.3](headless-iris-sync-compiler-guide.md#13-architectural-delivery-model-fork--headless-cli-layer-pattern-a), [Section 4.1-4.4](headless-iris-sync-compiler-guide.md#4-architectural-design-fork--headless-cli-layer-pattern-a), and [Section 6.1-6.5](headless-iris-sync-compiler-guide.md#6-extension-ecosystem-analysis--pattern-a-implementation-strategy), documenting the 52-file audit, concrete `vscode-shim.ts` specification, dual-target build system, and tree-shaking pipeline.

## Entry 013: Developer Experience Invariant — Foreground Interactive Watch vs. Background OS Daemonization

- **Date**: 2026-09-23
- **Finding**:
  1. Operating `iris-sync` as a detached local OS daemon (via `systemd` user units or `launchd` plists) introduces severe developer experience (DX) hazards on workstations:
     - **The Ghost Sync**: External version control operations (`git checkout`, `git rebase`, `git stash`) cause a detached background daemon to silently upload and compile intermediate, broken files into the IRIS server without developer intent or awareness.
     - **Invisible Failures**: Network drops, credential expirations, and Atelier 401/409 conflicts fail silently in background log files (`~/.iris-sync/daemon.log` or `journalctl`), leading to frustrating debugging sessions where developers wonder why server state diverged from disk.
     - **Context & Namespace Drift**: Working across multiple repositories or branches targeting different IRIS namespaces creates race conditions; a global background daemon cannot infer the developer's immediate focus.
     - **Zombie PIDs & Lifecycle Friction**: Stale PID files and hung sockets require hunting down background processes (`kill -9 $(pgrep iris-sync)`).
  2. Industry consensus across modern language compilers and synchronizers (`tsc --watch`, `cargo watch`, `esbuild --watch`, `air`) establishes that interactive developer tools should run in the foreground tied directly to a terminal session or editor split.
  3. In containerized CI/CD, Kubernetes, and staging environments, processes run as PID 1 in the foreground (`CMD ["iris-sync", "watch"]`), making local OS daemon wrappers structurally redundant in modern container-first architectures.
- **Resolution**:
  - Deprioritized **M2.1 (Background Service Daemonization)** as a primary developer workflow.
  - Designated **Foreground Interactive Watch (`iris-sync watch`)** as the official, first-class DX standard, providing explicit lifecycle control (`Ctrl+C` or closing terminal kills the watcher) and real-time visual compilation logs.
  - Preserved `iris-sync daemon` unit generator commands strictly as an optional, specialized utility for dedicated headless bare-metal staging servers.

## Entry 014: Studio Project Parity, Tracked File Sets & Headless Promotion/Ingestion Pipeline

- **Date**: 2026-09-23
- **Finding**:
  1. In legacy InterSystems IRIS Studio, Projects (`%Studio.Project` / `.PRJ` documents) served as the primary unit of deployment promotion: developers defined named item manifests (classes, routines, includes, csp) and exported them as monolithic XML packages (`%SYSTEM.OBJ.Export`) for ingestion into staging/production servers.
  2. In `vscode-objectscript`, project scoping was coupled exclusively to virtual `isfs://` workspace folders, leaving local filesystem (`file://`) and headless CI/CD operations without a way to define, track, diff, or deploy curated subsets of code offline.
  3. Package ingestion across diverse IRIS versions requires multi-tier transport fallbacks:
     - IRIS v7+ Atelier REST API provides `/action/xml/load`, which ingests XML packages server-side and returns the list of imported document names.
     - Older IRIS / Cache versions lack `/action/xml/load`. Direct fallback synthesis parsing (`<Document name="...">` extraction or `<Class name="...">` extraction combined with `api.putDoc` or `%SYSTEM_OBJ.Load` via SQL) ensures universal compatibility across all target environments.
  4. Scoped compilation (`iris-sync compile --project <name>`), scoped watching (`iris-sync watch --project <name>`), and project diffing (`iris-sync diff --project <name>`) prevent full-repository blast radius, restricting synchronization strictly to the files defined in `.iris-sync/projects/<name>.json`.
- **Resolution**:
  - Implemented complete Studio Project Parity subsystem in `src/headless/projectManifest.ts`.
  - Added CLI commands:
    - `iris-sync project list [--remote]`
    - `iris-sync project create <name> [--desc] [--server-prj] [--ns] [--format]`
    - `iris-sync project add <name> <files...>` / `iris-sync project remove <name> <files...>`
    - `iris-sync project show <name>`
    - `iris-sync project sync-manifest <name> [--direction]`
    - `iris-sync project export <name> -o <path> [--format xml|udl]`
    - `iris-sync project deploy <name> [-t <server>] [-n <ns>] [--compile] [--flags <flags>]`
    - `iris-sync project import <package> [-t <server>] [-n <ns>] [--compile] [--flags <flags>] [--save-manifest <name>]`
    - `iris-sync diff [file] [--project <name>]`
  - Integrated MCP tools `iris_project_export`, `iris_project_deploy`, and `iris_project_import` in `src/headless/mcpServer.ts` enabling AI coding agents to export and promote project packages directly.
  - Added full test coverage in Suite 10 (`test/shim.test.ts`), verifying XML/UDL ingestion fallbacks, command options, and MCP exposure (59 passed, 0 failed).


