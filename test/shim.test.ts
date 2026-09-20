/**
 * test/shim.test.ts
 * Rigorous Parity & Behavioral Verification Suite for Pattern A Virtual Runtime Shim.
 *
 * Verifies:
 * 1. Runtime correctness of Uri, workspace, window, workspaceState, commands, Disposable, EventEmitter, FileSystemError.
 * 2. Static AST contract validation across all upstream src/ files importing from "vscode".
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import * as vscodeShim from "../src/headless/vscode-shim";
import { stripJsonc, parseJsoncSafe, readJsonSafe, setSettingPreservingJsonc, resolveConfigForFile, resolveConfiguration } from "../src/headless/configBridge";

const {
  Uri,
  workspace,
  window,
  workspaceState,
  commands,
  Disposable,
  EventEmitter,
  FileSystemError,
  FileType,
  EndOfLine,
  HeadlessMemento,
  activeRuntimeConfig,
} = vscodeShim;

let testsPassed = 0;
let testsFailed = 0;

function it(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`  \x1b[32m✔\x1b[0m ${name}`);
      testsPassed++;
    } catch (err: any) {
      console.error(`  \x1b[31m✖\x1b[0m ${name}`);
      console.error(`    ${err.message || err}`);
      testsFailed++;
    }
  })();
}

async function runTests() {
  console.log("\n============================================================");
  console.log(" Running Virtual Runtime Shim (vscode-shim) Verification");
  console.log("============================================================\n");

  // -------------------------------------------------------------------------
  // Group 1: Uri & Path Handling
  // -------------------------------------------------------------------------
  console.log("Suite 1: Uri & Path Normalization");

  await it("Uri.file creates valid file URI", () => {
    const u = Uri.file("/path/to/file.cls");
    assert.strictEqual(u.scheme, "file");
    assert.strictEqual(u.fsPath, path.resolve("/path/to/file.cls"));
  });

  await it("Uri.parse parses custom schemas", () => {
    const u = Uri.parse("isfs://server:USER/MyClass.cls");
    assert.strictEqual(u.scheme, "isfs");
    assert.strictEqual(u.authority, "server:USER");
    assert.strictEqual(u.path, "/MyClass.cls");
  });

  await it("Uri.joinPath correctly appends path segments", () => {
    const base = Uri.file("/workspace/root");
    const joined = Uri.joinPath(base, "src", "MyPackage", "Class.cls");
    assert.strictEqual(joined.fsPath, path.resolve("/workspace/root/src/MyPackage/Class.cls"));
  });

  // -------------------------------------------------------------------------
  // Group 2: workspace Subsystem
  // -------------------------------------------------------------------------
  console.log("\nSuite 2: workspace Subsystem & Filesystem");

  await it("workspace.workspaceFolders returns current working directory", () => {
    const folders = workspace.workspaceFolders;
    assert.ok(Array.isArray(folders));
    assert.strictEqual(folders.length, 1);
    assert.strictEqual(folders[0].uri.fsPath, process.cwd());
  });

  await it("workspace.asRelativePath computes relative paths", () => {
    const abs = path.resolve(process.cwd(), "src/Test.cls");
    const rel = workspace.asRelativePath(Uri.file(abs));
    assert.strictEqual(rel, path.join("src", "Test.cls"));
  });

  await it("workspace.fs writeFile, readFile, stat, and delete work seamlessly", async () => {
    const testUri = Uri.file(path.resolve(process.cwd(), ".tmp-shim-test.txt"));
    const content = new TextEncoder().encode("ObjectScript Shim Test");

    await workspace.fs.writeFile(testUri, content);
    assert.ok(fs.existsSync(testUri.fsPath));

    const stat = await workspace.fs.stat(testUri);
    assert.strictEqual(stat.type, FileType.File);
    assert.ok(stat.size > 0);

    const readBytes = await workspace.fs.readFile(testUri);
    assert.strictEqual(new TextDecoder().decode(readBytes), "ObjectScript Shim Test");

    await workspace.fs.delete(testUri);
    assert.strictEqual(fs.existsSync(testUri.fsPath), false);
  });

  await it("workspace.fs throws FileSystemError.FileNotFound on missing file", async () => {
    const missingUri = Uri.file(path.resolve(process.cwd(), ".non-existent-file-12345.txt"));
    let thrown = false;
    try {
      await workspace.fs.readFile(missingUri);
    } catch (err: any) {
      thrown = true;
      assert.ok(err instanceof FileSystemError);
      assert.strictEqual(err.code, "FileNotFound");
    }
    assert.ok(thrown, "Expected readFile to throw FileSystemError.FileNotFound");
  });

  await it("workspace.fs.isWritableFileSystem returns true for 'file'", () => {
    assert.strictEqual(workspace.fs.isWritableFileSystem("file"), true);
    assert.strictEqual(workspace.fs.isWritableFileSystem("isfs"), false);
  });

  await it("workspace.openTextDocument provides lineAt, positionAt, offsetAt, and getText", async () => {
    const doc = await workspace.openTextDocument(path.resolve(process.cwd(), "test.cls"));
    assert.ok(doc.lineCount > 0);
    assert.strictEqual(doc.languageId, "objectscript-class");
    const line0 = doc.lineAt(0);
    assert.ok(line0.text !== undefined);
    assert.strictEqual(line0.lineNumber, 0);
    assert.strictEqual(line0.range.start.line, 0);
    assert.strictEqual(line0.range.end.character, line0.text.length);

    const pos = doc.positionAt(5);
    assert.strictEqual(typeof pos.line, "number");
    assert.strictEqual(typeof pos.character, "number");
    assert.strictEqual(doc.offsetAt(pos), 5);
  });

  await it("workspace.findFiles discovers ObjectScript files in workspace", async () => {
    const files = await workspace.findFiles({ base: process.cwd() });
    assert.ok(Array.isArray(files));
    assert.ok(files.length > 0);
    const hasTestCls = files.some((f) => f.fsPath.endsWith("test.cls"));
    assert.ok(hasTestCls, "Expected findFiles to discover test.cls");
  });

  // -------------------------------------------------------------------------
  // Group 3: Configuration Proxy & Hierarchical Resolution
  // -------------------------------------------------------------------------
  console.log("\nSuite 3: HeadlessConfiguration Proxy");

  await it("getConfiguration serves nested sections and fallback defaults", async () => {
    activeRuntimeConfig["objectscript"] = {
      compileFlags: "cukd",
      conn: {
        server: "my-iris",
        ns: "APP",
      },
    };

    const osConfig = workspace.getConfiguration("objectscript");
    assert.strictEqual(osConfig.get("compileFlags"), "cukd");
    assert.strictEqual(osConfig.get("conn.server"), "my-iris");
    assert.strictEqual(osConfig.get("nonExistent", "defaultVal"), "defaultVal");

    const connConfig = workspace.getConfiguration("objectscript.conn");
    assert.strictEqual(connConfig.get("server"), "my-iris");
    assert.strictEqual(connConfig.get("ns"), "APP");
    assert.strictEqual(connConfig.has("server"), true);
    assert.strictEqual(connConfig.has("absent"), false);
  });

  await it("getConfiguration performs case-insensitive lookup for server catalogs", () => {
    activeRuntimeConfig["intersystems.servers"] = {
      "Local-Iris": {
        webServer: { host: "127.0.0.1", port: 57772, scheme: "http" },
      },
    };

    const smConfig = workspace.getConfiguration("intersystems.servers");
    assert.strictEqual(smConfig.has("local-iris"), true);
    const spec: any = smConfig.get("local-iris");
    assert.ok(spec !== undefined);
    assert.strictEqual(spec.webServer.port, 57772);
  });

  // -------------------------------------------------------------------------
  // Group 4: Memento & Persistent State
  // -------------------------------------------------------------------------
  console.log("\nSuite 4: HeadlessMemento (workspaceState)");

  await it("HeadlessMemento updates, gets, and persists key-values", async () => {
    const tmpCachePath = path.resolve(process.cwd(), ".tmp-cache-test.json");
    const memento = new HeadlessMemento(tmpCachePath);

    await memento.update("testKey", "testValue");
    assert.strictEqual(memento.get("testKey"), "testValue");
    assert.strictEqual(memento.get("unseenKey", 42), 42);

    // Verify file persistence
    assert.ok(fs.existsSync(tmpCachePath));
    const memento2 = new HeadlessMemento(tmpCachePath);
    assert.strictEqual(memento2.get("testKey"), "testValue");
    fs.unlinkSync(tmpCachePath);
  });

  await it("workspaceState singleton provides global Memento storage", async () => {
    await workspaceState.update("singletonKey", "singletonValue");
    assert.strictEqual(workspaceState.get("singletonKey"), "singletonValue");
    await workspaceState.update("singletonKey", undefined);
    assert.strictEqual(workspaceState.get("singletonKey"), undefined);
  });

  // -------------------------------------------------------------------------
  // Group 5: Window, Commands, Events & Disposables
  // -------------------------------------------------------------------------
  console.log("\nSuite 5: Window, Commands, Events & Disposables");

  await it("commands register and execute commands properly", async () => {
    const d = commands.registerCommand("test.cmd", (arg: string) => `result:${arg}`);
    assert.ok(d instanceof Disposable);
    const res = await commands.executeCommand("test.cmd", "hello");
    assert.strictEqual(res, "result:hello");
    d.dispose();
    const resAfterDispose = await commands.executeCommand("test.cmd", "hello");
    assert.strictEqual(resAfterDispose, undefined);
  });

  await it("commands.executeCommand executes vscode.diff seamlessly", async () => {
    const testFile = Uri.file(path.resolve(process.cwd(), "test.cls"));
    let errOccurred = false;
    try {
      await commands.executeCommand("vscode.diff", testFile, testFile, "Self Diff Test");
    } catch (_) {
      errOccurred = true;
    }
    assert.strictEqual(errOccurred, false);
  });

  await it("window.showErrorMessage deterministically evaluates conflict policies", async () => {
    const conflictMsg = "Failed to import 'User.Test.cls': The version of the file on the server is newer.";
    const choices = ["Compare", "Overwrite on Server", "Pull Server Changes", "Cancel"];

    activeRuntimeConfig["conflictPolicy"] = "overwrite";
    const actionOverwrite = await window.showErrorMessage(conflictMsg, ...choices);
    assert.strictEqual(actionOverwrite, "Overwrite on Server");

    activeRuntimeConfig["conflictPolicy"] = "pull";
    const actionPull = await window.showErrorMessage(conflictMsg, ...choices);
    assert.strictEqual(actionPull, "Pull Server Changes");

    activeRuntimeConfig["conflictPolicy"] = "diff";
    const actionDiff = await window.showErrorMessage(conflictMsg, ...choices);
    assert.strictEqual(actionDiff, "Compare");

    activeRuntimeConfig["conflictPolicy"] = "fail";
    const actionFail = await window.showErrorMessage(conflictMsg, ...choices);
    assert.strictEqual(actionFail, "Cancel");
  });

  await it("Disposable.from executes all disposables", () => {
    let disposedCount = 0;
    const d1 = new Disposable(() => disposedCount++);
    const d2 = new Disposable(() => disposedCount++);
    const composite = Disposable.from(d1, d2);
    composite.dispose();
    assert.strictEqual(disposedCount, 2);
  });

  await it("EndOfLine has LF and CRLF constants", () => {
    assert.strictEqual(EndOfLine.LF, 1);
    assert.strictEqual(EndOfLine.CRLF, 2);
  });

  await it("window.createOutputChannel returns streamable channel", () => {
    const channel = window.createOutputChannel("TestChannel");
    assert.strictEqual(channel.name, "TestChannel");
    assert.doesNotThrow(() => channel.append("data"));
    assert.doesNotThrow(() => channel.appendLine("line"));
  });

  await it("window.withProgress executes task and passes token", async () => {
    let executed = false;
    const result = await window.withProgress({ location: 15 }, async (progress, token) => {
      assert.strictEqual(token.isCancellationRequested, false);
      progress.report({ message: "working" });
      executed = true;
      return "done";
    });
    assert.strictEqual(executed, true);
    assert.strictEqual(result, "done");
  });

  await it("EventEmitter fires events and Disposable unsubscribes", () => {
    const emitter = new EventEmitter<number>();
    let received = 0;
    const sub = emitter.event((val) => {
      received = val;
    });

    emitter.fire(42);
    assert.strictEqual(received, 42);

    sub.dispose();
    emitter.fire(99);
    assert.strictEqual(received, 42); // Should remain 42 after disposal
  });

  await it("FileSystemError has static factories and correct error codes", () => {
    const fnf = FileSystemError.FileNotFound("file.txt");
    assert.strictEqual(fnf.name, "FileSystemError");
    assert.strictEqual(fnf.code, "FileNotFound");
    assert.ok(fnf instanceof FileSystemError);

    const fe = FileSystemError.FileExists("file.txt");
    assert.strictEqual(fe.code, "FileExists");
  });

  // -------------------------------------------------------------------------
  // Group 6: Upstream Static AST Coverage Scanner
  // -------------------------------------------------------------------------
  console.log("\nSuite 6: Automated Upstream AST Contract Parity Scanner");

  await it("All vscode.* properties referenced across upstream src/ are implemented in shim", () => {
    const srcDir = path.resolve(__dirname, "../src");
    const walk = (dir: string): string[] => {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const item of list) {
        const full = path.join(dir, item);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          // Skip headless directory itself during parity scan
          if (item !== "headless") {
            results = results.concat(walk(full));
          }
        } else if (item.endsWith(".ts")) {
          results.push(full);
        }
      }
      return results;
    };

    const files = walk(srcDir);
    const referencedSymbols = new Set<string>();

    for (const f of files) {
      const content = fs.readFileSync(f, "utf8");
      // Find all vscode.<symbol> or vsc.<symbol>
      const matches = content.matchAll(/\bvsc(?:ode)?\.([a-zA-Z0-9_$]+)/g);
      for (const m of matches) {
        referencedSymbols.add(m[1]);
      }
    }

    const missingSymbols: string[] = [];
    for (const sym of referencedSymbols) {
      if ((vscodeShim as any)[sym] === undefined) {
        missingSymbols.push(sym);
      }
    }

    if (missingSymbols.length > 0) {
      assert.fail(`Missing symbols in vscode-shim.ts required by upstream: ${missingSymbols.join(", ")}`);
    }

    console.log(`    (Scanned ${files.length} upstream files, checked ${referencedSymbols.size} symbols: 100% covered)`);
  });

  // -------------------------------------------------------------------------
  // Group 7: JSONC Parser & Settings Preservation
  // -------------------------------------------------------------------------
  console.log("\nSuite 7: JSONC Parser & Non-Destructive Settings Preservation");

  await it("stripJsonc strips single-line comments, block comments, and trailing commas", () => {
    const raw = `
    {
      // Single line comment
      "a": 1,
      /* Multi-line
         comment */
      "b": [
        "item1",
        "item2",
      ],
      "c": {
        "nested": true,
      },
    }
    `;
    const stripped = stripJsonc(raw);
    const parsed = JSON.parse(stripped);
    assert.strictEqual(parsed.a, 1);
    assert.deepStrictEqual(parsed.b, ["item1", "item2"]);
    assert.strictEqual(parsed.c.nested, true);
  });

  await it("parseJsoncSafe parses JSONC content and handles invalid JSON gracefully", () => {
    const valid = parseJsoncSafe(`{"test": 123,}`);
    assert.strictEqual(valid?.test, 123);

    const invalid = parseJsoncSafe(`{ not valid json at all }`);
    assert.strictEqual(invalid, null);
  });

  await it("readJsonSafe reads .vscode/settings.json containing trailing commas and preserves settings", () => {
    const settingsPath = path.resolve(__dirname, "../.vscode/settings.json");
    if (fs.existsSync(settingsPath)) {
      const data = readJsonSafe(settingsPath);
      assert.ok(data !== null && typeof data === "object");
      assert.ok("[typescript]" in data || "intersystems.servers" in data);
    }
  });

  await it("setSettingPreservingJsonc preserves developer comments and trailing commas", () => {
    const rawWithComments = `{\n  // Developer note: do not edit proxy\n  "http.proxyStrictSSL": true,\n  /* Multi-line comment\n     about servers */\n  "objectscript.syncLocalChanges": "all",\n}`;
    const updated = setSettingPreservingJsonc(rawWithComments, "objectscript.syncLocalChanges", "vscodeOnly");
    assert.ok(updated.includes("// Developer note: do not edit proxy"));
    assert.ok(updated.includes("/* Multi-line comment"));
    assert.ok(updated.includes('"objectscript.syncLocalChanges": "vscodeOnly"'));
    const parsed = parseJsoncSafe(updated);
    assert.strictEqual(parsed["objectscript.syncLocalChanges"], "vscodeOnly");
    assert.strictEqual(parsed["http.proxyStrictSSL"], true);

    // Test insertion into JSONC with comments
    const inserted = setSettingPreservingJsonc(`{\n  // Comment\n  "a": 1\n}`, "newKey", "val");
    assert.ok(inserted.includes("// Comment"));
    assert.ok(inserted.includes('"newKey": "val"'));
    const parsedInserted = parseJsoncSafe(inserted);
    assert.strictEqual(parsedInserted.newKey, "val");
    assert.strictEqual(parsedInserted.a, 1);
  });

  // -------------------------------------------------------------------------
  // Group 8: Document Name Resolution Authority
  // -------------------------------------------------------------------------
  console.log("\nSuite 8: Document Name Resolution & Header Authority");

  const { getIrisSyncVersions } = require("../src/headless/version");
  const { binaryFilename, compositeVersion } = getIrisSyncVersions();
  const binPath = path.resolve(__dirname, `../dist/cli/${binaryFilename}`);

  await it("Resolves standard class name, single-segment class, underscores, and category routines correctly", () => {
    const { resolveDocName } = require(binPath);
    const tmpDir = path.resolve("/tmp/iris-docname-test");
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      fs.writeFileSync(path.join(tmpDir, "Single.cls"), "Class Test Extends %RegisteredObject {}");
      fs.writeFileSync(path.join(tmpDir, "Percent.cls"), "Class %Test Extends %RegisteredObject {}");
      fs.writeFileSync(path.join(tmpDir, "Pkg.cls"), "Class MyApp.Order Extends %RegisteredObject {}");
      fs.writeFileSync(path.join(tmpDir, "OrderItem.cls"), "Class User.Order_Item Extends %RegisteredObject {}");
      fs.writeFileSync(path.join(tmpDir, "MultiPkg.cls"), "Class My_Company.Order_System.Special_Handler Extends %RegisteredObject {}");
      fs.writeFileSync(path.join(tmpDir, "myRtn.mac"), "ROUTINE myRtn\n write 1");

      const single = resolveDocName(path.join(tmpDir, "Single.cls"), tmpDir);
      const percent = resolveDocName(path.join(tmpDir, "Percent.cls"), tmpDir);
      const pkg = resolveDocName(path.join(tmpDir, "Pkg.cls"), tmpDir);
      const underscoreClass = resolveDocName(path.join(tmpDir, "OrderItem.cls"), tmpDir);
      const underscoreMulti = resolveDocName(path.join(tmpDir, "MultiPkg.cls"), tmpDir);
      const rtn = resolveDocName(path.join(tmpDir, "myRtn.mac"), tmpDir);
      const catRtn = resolveDocName("src/routines/test.mac", "src");
      const catInc = resolveDocName("src/inc/myInc.inc", "src");
      const catClsPkg = resolveDocName("src/cls/MyPkg/MyClass.cls", "src");
      const catClsSingle = resolveDocName("src/cls/Test.cls", "src");
      const outsideRtn = resolveDocName("test.mac", "src");

      assert.strictEqual(single, "Test.cls");
      assert.strictEqual(percent, "%Test.cls");
      assert.strictEqual(pkg, "MyApp.Order.cls");
      assert.strictEqual(underscoreClass, "User.Order_Item.cls");
      assert.strictEqual(underscoreMulti, "My_Company.Order_System.Special_Handler.cls");
      assert.strictEqual(rtn, "myRtn.mac");
      assert.strictEqual(catRtn, "test.mac");
      assert.strictEqual(catInc, "myInc.inc");
      assert.strictEqual(catClsPkg, "MyPkg.MyClass.cls");
      assert.strictEqual(catClsSingle, "Test.cls");
      assert.strictEqual(outsideRtn, "test.mac");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // Group 9: CLI Commands End-to-End Execution
  // -------------------------------------------------------------------------
  console.log("\nSuite 9: CLI Commands End-to-End Verification");

  await it("iris-sync -V outputs composite dual-version identifier", () => {
    const out = execSync(`node "${binPath}" -V`, { encoding: "utf8" });
    assert.strictEqual(out.trim(), compositeVersion);
  });

  await it("iris-sync --help lists all required commands including git-sync and setup", () => {
    const out = execSync(`node "${binPath}" --help`, { encoding: "utf8" });
    assert.ok(out.includes("git-sync"));
    assert.ok(out.includes("setup"));
    assert.ok(out.includes("config"));
    assert.ok(out.includes("diff"));
    assert.ok(out.includes("pull"));
    assert.ok(out.includes("watch"));
    assert.ok(out.includes("build"));
    assert.ok(out.includes("ping"));
  });

  await it("iris-sync setup --help lists --from-registry and --git-hooks options", () => {
    const out = execSync(`node "${binPath}" setup --help`, { encoding: "utf8" });
    assert.ok(out.includes("--from-registry"));
    assert.ok(out.includes("--from-vscode"));
    assert.ok(out.includes("--git-hooks"));
  });

  await it("iris-sync git-sync executes cleanly on HEAD", () => {
    const out = execSync(`node "${binPath}" git-sync --from HEAD --to HEAD --quiet`, {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
    });
    assert.strictEqual(out.trim(), "");
  });

  // -------------------------------------------------------------------------
  // Group 10: Studio Project Parity & Daemon Management
  // -------------------------------------------------------------------------
  console.log("\nSuite 10: Studio Project Parity & Daemon Subsystems");

  await it("iris-sync project --help lists all project management commands", () => {
    const out = execSync(`node "${binPath}" project --help`, { encoding: "utf8" });
    assert.ok(out.includes("list"));
    assert.ok(out.includes("create"));
    assert.ok(out.includes("add"));
    assert.ok(out.includes("remove"));
    assert.ok(out.includes("show"));
    assert.ok(out.includes("sync-manifest"));
    assert.ok(out.includes("export"));
    assert.ok(out.includes("deploy"));
  });

  await it("iris-sync compile and watch list --project option", () => {
    const compileHelp = execSync(`node "${binPath}" compile --help`, { encoding: "utf8" });
    assert.ok(compileHelp.includes("--project"));

    const watchHelp = execSync(`node "${binPath}" watch --help`, { encoding: "utf8" });
    assert.ok(watchHelp.includes("--project"));
  });

  await it("Project manifest lifecycle: create, add, show, list, and remove", () => {
    const testDir = path.resolve("/tmp/iris-project-lifecycle-test");
    fs.mkdirSync(testDir, { recursive: true });
    try {
      // 1. Create project
      const createOut = execSync(`node "${binPath}" project create BillingService --desc "Test Billing"`, {
        cwd: testDir,
        encoding: "utf8",
      });
      assert.ok(createOut.includes("Created project manifest"));

      const manifestPath = path.join(testDir, ".iris-sync/projects/BillingService.json");
      assert.ok(fs.existsSync(manifestPath));
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      assert.strictEqual(manifest.name, "BillingService");
      assert.strictEqual(manifest.description, "Test Billing");
      assert.strictEqual(manifest.serverProject, "BillingService.PRJ");

      // 2. Add items
      const addOut = execSync(`node "${binPath}" project add BillingService src/cls/Invoice.cls src/mac/BILL.mac`, {
        cwd: testDir,
        encoding: "utf8",
      });
      assert.ok(addOut.includes("Total items: 2"));

      const updated = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      assert.strictEqual(updated.items.length, 2);

      // 3. Show project
      const showOut = execSync(`node "${binPath}" project show BillingService`, {
        cwd: testDir,
        encoding: "utf8",
      });
      assert.ok(showOut.includes("Project: BillingService"));
      assert.ok(showOut.includes("Tracked Files:   2"));

      // 4. List projects
      const listOut = execSync(`node "${binPath}" project list`, {
        cwd: testDir,
        encoding: "utf8",
      });
      assert.ok(listOut.includes("BillingService (2 items)"));

      // 5. Remove item
      const removeOut = execSync(`node "${binPath}" project remove BillingService src/mac/BILL.mac`, {
        cwd: testDir,
        encoding: "utf8",
      });
      assert.ok(removeOut.includes("Remaining items: 1"));

      const finalManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      assert.strictEqual(finalManifest.items.length, 1);
      assert.strictEqual(finalManifest.items[0], "src/cls/Invoice.cls");
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  await it("iris-sync daemon --help and install unit generators output valid service configs", () => {
    const helpOut = execSync(`node "${binPath}" daemon --help`, { encoding: "utf8" });
    assert.ok(helpOut.includes("start"));
    assert.ok(helpOut.includes("status"));
    assert.ok(helpOut.includes("stop"));
    assert.ok(helpOut.includes("install"));

    const systemdOut = execSync(`node "${binPath}" daemon install --systemd`, { encoding: "utf8" });
    assert.ok(systemdOut.includes("[Unit]"));
    assert.ok(systemdOut.includes("ExecStart="));
    assert.ok(systemdOut.includes("iris-sync.service"));

    const launchdOut = execSync(`node "${binPath}" daemon install --launchd`, { encoding: "utf8" });
    assert.ok(launchdOut.includes("<key>Label</key>"));
    assert.ok(launchdOut.includes("com.g3labz.iris-sync"));
  });

  await it("iris-sync compile, watch, build support --stream WebSocket option (M2.2)", () => {
    const compileHelp = execSync(`node "${binPath}" compile --help`, { encoding: "utf8" });
    assert.ok(compileHelp.includes("--stream"));
    assert.ok(compileHelp.includes("WebSocket"));

    const watchHelp = execSync(`node "${binPath}" watch --help`, { encoding: "utf8" });
    assert.ok(watchHelp.includes("--stream"));

    const buildHelp = execSync(`node "${binPath}" build --help`, { encoding: "utf8" });
    assert.ok(buildHelp.includes("--stream"));
  });

  await it("Multi-Namespace mappings: resolveConfigForFile routes file paths to mapped namespaces (M2.3)", () => {
    const baseConfig = resolveConfiguration();
    const configWithMappings = {
      ...baseConfig,
      namespace: "USER",
      mappings: [
        { dir: "src/billing", namespace: "BILLING" },
        { dir: "src/core", namespace: "CORE", server: "prod-iris" },
      ],
      servers: {
        ...baseConfig.servers,
        "prod-iris": {
          webServer: { scheme: "https" as const, host: "prod.local", port: 52773 },
          username: "SUPER",
          password: "SECRET",
        },
      },
    };

    // 1. File matching src/billing
    const billingConfig = resolveConfigForFile(configWithMappings, "src/billing/Invoice.cls");
    assert.strictEqual(billingConfig.namespace, "BILLING");
    assert.strictEqual(billingConfig.serverName, configWithMappings.serverName);

    // 2. File matching src/core with server override
    const coreConfig = resolveConfigForFile(configWithMappings, "src/core/Kernel.cls");
    assert.strictEqual(coreConfig.namespace, "CORE");
    assert.strictEqual(coreConfig.serverName, "prod-iris");
    assert.strictEqual(coreConfig.serverSpec.webServer.host, "prod.local");

    // 3. File outside mappings retains base config
    const defaultFileConfig = resolveConfigForFile(configWithMappings, "src/other/Test.cls");
    assert.strictEqual(defaultFileConfig.namespace, "USER");
    assert.strictEqual(defaultFileConfig.serverName, configWithMappings.serverName);
  });

  await it("Standalone native binary executes directly without Node wrapper (M2.4)", () => {
    const platform = process.platform;
    const arch = process.arch;
    const ext = platform === "win32" ? ".exe" : "";
    const nativeBin = path.resolve(__dirname, `../dist/cli/iris-sync-${platform}-${arch}${ext}`);
    if (fs.existsSync(nativeBin)) {
      const out = execSync(`"${nativeBin}" -V`, { encoding: "utf8" }).trim();
      assert.ok(out.startsWith("b.3.8.6-SNAPSHOT-c."));
      const help = execSync(`"${nativeBin}" --help`, { encoding: "utf8" });
      assert.ok(help.includes("InterSystems IRIS Headless"));
    }
  });

  console.log("\n============================================================");
  console.log(` Test Summary: ${testsPassed} passed, ${testsFailed} failed`);
  console.log("============================================================\n");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
