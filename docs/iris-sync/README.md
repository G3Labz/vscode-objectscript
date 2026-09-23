# iris-sync

**Standalone Headless InterSystems IRIS Synchronization & Compiler Engine**

> Compile, watch, test, and deploy ObjectScript from terminals, CI/CD pipelines, and AI coding agents — no IDE required.

---

## What Is iris-sync?

`iris-sync` is a standalone CLI tool that synchronizes and compiles InterSystems ObjectScript (`.cls`, `.mac`, `.inc`) files against a remote IRIS server over the Atelier REST API — completely outside of VS Code.

It is built as a **zero-modification fork layer** on top of the official [`intersystems-community/vscode-objectscript`](https://github.com/intersystems-community/vscode-objectscript) extension. At build time, all `import "vscode"` calls are aliased to a headless shim (`src/headless/vscode-shim.ts`), letting the battle-tested upstream API client, compiler, and document resolver run unmodified in a terminal.

### Why?

The official extension only works inside a running VS Code window. That means:

- **No CI/CD**: You can't compile ObjectScript in a GitHub Actions workflow or GitLab CI pipeline.
- **No headless servers**: Remote terminal sessions, containers, and SSH environments have no filesystem watcher.
- **No AI agents**: Autonomous coding agents editing `.cls` files on disk have no way to push changes to IRIS.
- **Resource waste**: Keeping a full Electron IDE open 24/7 just for a file watcher is impractical.

`iris-sync` solves all of these by giving you the same compiler and sync engine as a lightweight, standalone command.

---

## Features

| Category | Capability |
|---|---|
| **Compile** | Single-file (`iris-sync compile file.cls`), batch (`iris-sync build --all`), project-scoped (`--project`) |
| **Watch** | Filesystem watcher with echo suppression, VS Code coexistence mode (`--coexist`) |
| **Git Sync** | Atomic post-checkout/post-merge hook (`iris-sync git-sync`) |
| **Projects** | Full `%Studio.Project` parity — create, add, remove, export, deploy |
| **Test** | Headless `%UnitTest` runner with JUnit XML, TAP v13, and JSON output |
| **Diagnostics** | Structured error reporting in JSON and OASIS SARIF v2.1.0 |
| **MCP Server** | Model Context Protocol for AI coding agents (`iris-sync mcp`) |
| **Daemon** | Background service with systemd/launchd generators |
| **Streaming** | Real-time WebSocket compiler output (`--stream`) |
| **Config** | Two-tier `.iris-sync/` config with `.vscode/settings.json` auto-fallback |
| **Native Binary** | Zero-dependency Node SEA executable — no Node.js install needed |

---

## Quick Start

### Prerequisites

- An InterSystems IRIS instance with the Atelier REST API enabled (web port `52773` or `57772`).
- Credentials with write access to the target namespace.

### 1. Install

Choose any method:

**Direct binary download** (no dependencies):

```bash
curl -sSL "https://github.com/G3Labz/vscode-objectscript/releases/download/b.3.8.7-SNAPSHOT-c.0.3.0-ALPHA/iris-sync-linux-x64.tar.gz" \
  | tar -xz -C /usr/local/bin/
chmod +x /usr/local/bin/iris-sync
```

**npm** (requires Node.js ≥ 18):

```bash
npm install -g github:G3Labz/vscode-objectscript
```

**mise** (recommended for version management — see [Configuring with mise](#configuring-with-mise) below):

```bash
mise use "github:G3Labz/vscode-objectscript@b.3.8.7-SNAPSHOT-c.0.3.0-ALPHA"
```

### 2. Initialize a Workspace

```bash
cd /path/to/your/objectscript-project
iris-sync init
```

This creates `.iris-sync/config.json` and `.iris-sync/servers.json` with sensible defaults.

### 3. Configure Your Server

Edit `.iris-sync/servers.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/G3Labz/vscode-objectscript/master/schemas/irisservers.schema.json",
  "version": 1,
  "servers": {
    "local": {
      "description": "Local IRIS Development Server",
      "webServer": {
        "scheme": "http",
        "host": "127.0.0.1",
        "port": 52773,
        "pathPrefix": ""
      },
      "username": "_SYSTEM"
    }
  }
}
```

Edit `.iris-sync/config.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/G3Labz/vscode-objectscript/master/schemas/irisrc.schema.json",
  "activeProfile": "dev",
  "profiles": {
    "dev": {
      "server": "local",
      "namespace": "USER",
      "compileFlags": "cuk",
      "sourceRoot": "src",
      "watchPatterns": ["src/**/*.cls", "src/**/*.mac", "src/**/*.inc"],
      "conflictPolicy": "fail"
    }
  }
}
```

> [!TIP]
> If you already have `.vscode/settings.json` with `objectscript.conn` and `intersystems.servers` configured, skip this step entirely — `iris-sync` auto-discovers and uses those settings in **Zero-Config Compatibility Mode**.

### 4. Set Your Password

Passwords are resolved from environment variables (never stored in config files):

```bash
export IRIS_PASSWORD="SYS"
```

### 5. Compile a File

```bash
iris-sync compile src/MyApp/Service.cls
```

### 6. Watch for Changes

```bash
iris-sync watch
```

Every saved `.cls`, `.mac`, or `.inc` file under `src/` is automatically uploaded and compiled on the IRIS server.

### 7. Run Tests

```bash
iris-sync test --suite User.Test --format junit --output results.xml
```

---

## Running Bare (No Package Manager)

If you want to run `iris-sync` without any package manager, toolchain, or even Node.js installed:

**1. Download the standalone native binary for your platform:**

```bash
# Linux x64
curl -sSL -o iris-sync \
  "https://github.com/G3Labz/vscode-objectscript/releases/download/b.3.8.7-SNAPSHOT-c.0.3.0-ALPHA/iris-sync-b.3.8.7-SNAPSHOT-c.0.3.0-ALPHA-linux-x64"
chmod +x iris-sync
```

**2. Verify it works:**

```bash
./iris-sync --version
# → b.3.8.7-SNAPSHOT-c.0.3.0-ALPHA

./iris-sync --help
```

**3. (Optional) Move it somewhere on your PATH:**

```bash
sudo mv iris-sync /usr/local/bin/
```

**4. Use it directly:**

```bash
# Quick compile with inline connection flags
iris-sync compile src/MyApp/Handler.cls \
  --host 127.0.0.1 --port 52773 --namespace USER

# Watch a project directory
iris-sync watch --dir ./src --conflict overwrite

# Atomic Git sync after branch switch
iris-sync git-sync --from HEAD@{1} --to HEAD

# Export structured diagnostics for a CI pipeline
iris-sync build --all --format sarif --output report.sarif

# Run as an MCP server for AI coding agents
iris-sync mcp
```

That's it — a single self-contained binary, no Node.js, no npm, no dependencies.

---

## Configuring with mise

[mise](https://mise.jdx.dev/) is a polyglot version manager (the modern successor to `asdf`). It provides reproducible, per-project tool versioning via a `mise.toml` file committed to your repository.

### Why mise?

- **Pinned versions per project**: Every team member and CI runner uses the exact same `iris-sync` version.
- **Automatic activation**: `cd` into the project directory and the correct binary is on your PATH — no manual setup.
- **No global installs**: Tools are isolated per-project and per-version.

### Setup

**1. Install mise** (if you don't have it):

```bash
curl https://mise.jdx.dev/install.sh | sh
```

**2. Add `iris-sync` to your project's `mise.toml`:**

```toml
[tools]
"github:G3Labz/vscode-objectscript" = "b.3.8.7-SNAPSHOT-c.0.3.0-ALPHA"
```

> [!NOTE]
> All current releases are pre-release (`ALPHA`). You must pin an explicit version tag — `latest` won't resolve because GitHub's `/releases/latest` endpoint excludes pre-releases.

**3. Install:**

Or use the one-liner that creates the `mise.toml` for you:

```bash
mise use "github:G3Labz/vscode-objectscript@b.3.8.7-SNAPSHOT-c.0.3.0-ALPHA"
```

Then activate the tool:

```bash
mise install
```

mise downloads the native binary from the matching GitHub release and makes it available as `iris-sync`:

```bash
which iris-sync
# → ~/.local/share/mise/installs/github-g3-labz-vscode-objectscript/<version>/iris-sync

iris-sync --version
# → b.3.8.7-SNAPSHOT-c.0.3.0-ALPHA
```

**4. Upgrade to a newer release:**

```bash
mise use "github:G3Labz/vscode-objectscript@<new-tag>"
mise install
```

**5. Commit `mise.toml` to your repository:**

```bash
git add mise.toml
git commit -m "chore: pin iris-sync version via mise"
```

Now every developer who clones the repo just runs `mise install` and gets the same version.

### Alternative: Custom Plugin Registration

For teams that prefer explicit plugin management:

```toml
[plugins]
iris-sync = "https://github.com/G3Labz/vscode-objectscript.git"

[tools]
iris-sync = "latest"
```

This uses the bundled `asdf`-compatible plugin scripts in `plugins/asdf-iris-sync/`.

---

## Environment Variables

`iris-sync` supports 12-factor configuration via environment variables. These take precedence over config files:

| Variable | Description | Example |
|---|---|---|
| `IRIS_HOST` | IRIS server hostname or IP | `127.0.0.1` |
| `IRIS_PORT` | Atelier web port | `52773` |
| `IRIS_USERNAME` | Connection username | `_SYSTEM` |
| `IRIS_PASSWORD` | Connection password | `SYS` |
| `IRIS_NAMESPACE` | Target namespace | `USER` |
| `IRIS_SCHEME` | `http` or `https` | `http` |

---

## Configuration Hierarchy

Resolution order (highest precedence first):

1. **CLI flags** (`--host`, `--port`, `--namespace`, `--flags`)
2. **Environment variables** (`IRIS_HOST`, `IRIS_PORT`, etc.)
3. **Local workspace config** (`./.iris-sync/config.json`)
4. **Global user config** (`~/.iris-sync/config.json`)
5. **VS Code settings fallback** (`./.vscode/settings.json`)

---

## Further Reading

- **[Architectural Blueprint & Implementation Guide](headless-iris-sync-compiler-guide.md)** — Deep dive into the Atelier protocol, Pattern A shim architecture, and full configuration reference.
- **[Product Roadmap](roadmap.md)** — Phase status, completed milestones, and upcoming features.
- **[Empirical Findings Log](EMPIRICISM.md)** — Protocol discoveries, concurrency semantics, and architectural decision records.
- **[GitHub Releases](https://github.com/G3Labz/vscode-objectscript/releases)** — Precompiled binaries and changelogs.

---

## License

This project is a fork of [`intersystems-community/vscode-objectscript`](https://github.com/intersystems-community/vscode-objectscript) and retains its original MIT license. The `iris-sync` headless CLI layer (`src/headless/`) is authored by [G3Labz](https://github.com/G3Labz).
