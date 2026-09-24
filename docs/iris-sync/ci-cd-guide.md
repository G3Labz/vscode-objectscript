# CI/CD Integration Guide: `iris-sync`

This guide explains how to integrate `iris-sync` into automated Continuous Integration and Continuous Deployment (CI/CD) pipelines to compile, test, and deploy InterSystems ObjectScript code without an active VS Code or IDE instance.

---

## 1. GitHub Actions

`iris-sync` provides an official GitHub Action (`action.yml`) in this repository.

### Workflow Example: Compile & Test on Pull Request

Create `.github/workflows/objectscript-ci.yml`:

```yaml
name: ObjectScript CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      # 1. Compile entire workspace and generate SARIF diagnostic report
      - name: Compile ObjectScript Workspace
        uses: G3Labz/vscode-objectscript@b.3.8.7-SNAPSHOT-c.0.3.1-ALPHA
        with:
          action: "build"
          host: ${{ secrets.IRIS_HOST }}
          port: ${{ secrets.IRIS_PORT || '52773' }}
          namespace: ${{ vars.IRIS_NAMESPACE || 'USER' }}
          username: ${{ secrets.IRIS_USER || '_SYSTEM' }}
          password: ${{ secrets.IRIS_PASSWORD }}
          flags: "cuk"
          format: "sarif"
          output: "diagnostics.sarif"

      # 2. Upload SARIF diagnostics to GitHub Code Scanning (optional)
      - name: Upload SARIF diagnostics
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: "diagnostics.sarif"

      # 3. Run %UnitTest suite and export JUnit XML
      - name: Execute %UnitTest Suites
        uses: G3Labz/vscode-objectscript@b.3.8.7-SNAPSHOT-c.0.3.1-ALPHA
        with:
          action: "test"
          test-package: "User.Tests"
          host: ${{ secrets.IRIS_HOST }}
          port: ${{ secrets.IRIS_PORT || '52773' }}
          namespace: ${{ vars.IRIS_NAMESPACE || 'USER' }}
          username: ${{ secrets.IRIS_USER || '_SYSTEM' }}
          password: ${{ secrets.IRIS_PASSWORD }}
          format: "junit"
          output: "test-results.xml"

      # 4. Publish JUnit Test Results
      - name: Publish Test Results
        uses: EnricoMi/publish-unit-test-result-action@v2
        if: always()
        with:
          junit_files: "test-results.xml"
```

### Action Inputs Reference

| Input | Description | Default | Required |
| :--- | :--- | :--- | :--- |
| `action` | Action to execute: `build`, `compile`, `test`, `project-deploy`, `project-export` | `build` | No |
| `file` | Relative path to `.cls`, `.mac`, or `.inc` (for `compile`) | - | Only if `action: compile` |
| `project` | Studio Project manifest name (for `project-deploy` / `project-export`) | - | Only if project action |
| `host` | Target InterSystems IRIS host | `127.0.0.1` | No |
| `port` | Atelier REST API web port | `52773` | No |
| `namespace` | Target namespace | `USER` | No |
| `username` | IRIS username | `_SYSTEM` | No |
| `password` | IRIS user password | - | **Yes** |
| `flags` | Compiler flags | `cuk` | No |
| `format` | Output report format: `text`, `json`, `sarif`, `junit`, `tap` | - | No |
| `output` | Path to generated report file | - | No |
| `test-package`| Target `%UnitTest` test package or class name | - | Only for `test` |
| `extra-args` | Additional raw arguments to pass to `iris-sync` | - | No |

---

## 2. Docker Container (`ghcr.io/g3labz/iris-sync`)

You can execute `iris-sync` in any container runtime (Docker, Podman, Kubernetes, or containerized CI runners).

### Pull & Run

```bash
# Pull the latest container
docker pull ghcr.io/g3labz/iris-sync:latest

# Mount your local repository and compile against remote IRIS
docker run --rm \
  -v "$(pwd):/workspace" \
  -e IRIS_HOST="192.168.1.100" \
  -e IRIS_PORT="52773" \
  -e IRIS_NAMESPACE="USER" \
  -e IRIS_USERNAME="_SYSTEM" \
  -e IRIS_PASSWORD="SYS" \
  ghcr.io/g3labz/iris-sync:latest \
  build --all --format sarif --output report.sarif
```

---

## 3. GitLab CI/CD

Include the official template in your repository's `.gitlab-ci.yml`:

```yaml
include:
  - remote: 'https://raw.githubusercontent.com/G3Labz/vscode-objectscript/master/templates/gitlab-ci/iris-sync.gitlab-ci.yml'

variables:
  IRIS_HOST: "iris.internal.company.com"
  IRIS_PORT: "52773"
  IRIS_NAMESPACE: "APP_DEV"
  IRIS_USERNAME: "ci_service_user"
  # IRIS_PASSWORD is set in GitLab CI/CD Settings -> Variables (Masked)
```

This automatically provides:
- **`iris-compile`**: Runs on merge requests, produces GitLab Code Quality SARIF reports.
- **`iris-test`**: Runs `%UnitTest` test classes and surfaces test results in GitLab Merge Requests.
- **`iris-deploy`**: Manual gated deploy job for production promotion.

---

## 4. Azure DevOps & Bitbucket Pipelines

In other CI environments without dedicated actions, install the standalone native binary via `curl` in a single step:

```bash
# Install standalone zero-dependency native binary
curl -sSL "https://github.com/G3Labz/vscode-objectscript/releases/download/b.3.8.7-SNAPSHOT-c.0.3.1-ALPHA/iris-sync-linux-x64.tar.gz" \
  | tar -xz -C /usr/local/bin/

# Execute
iris-sync build --all
```
