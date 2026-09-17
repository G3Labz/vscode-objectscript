/**
 * build/esbuild.cli.ts
 * Dual-target bundler script assembling standalone iris-sync CLI binary.
 *
 * Implements Pattern A build-time module aliasing:
 * Maps all upstream "vscode" imports to src/headless/vscode-shim.ts
 * and executes aggressive tree-shaking to eliminate UI/editor webviews.
 *
 * Outputs versioned artifact to dist/cli/iris-sync-b.<ext>-c.<cli>.js
 * and updates canonical dist/cli/iris-sync.js.
 */

import * as esbuild from "esbuild";
import * as path from "path";
import * as fs from "fs";
import { getIrisSyncVersions } from "../src/headless/version";

async function runBuild() {
  const isWatch = process.argv.includes("--watch");
  const { extensionVersion, cliVersion, compositeVersion, binaryFilename } = getIrisSyncVersions();

  const distCliDir = path.resolve(__dirname, "../dist/cli");
  const outfile = path.join(distCliDir, binaryFilename);
  const canonicalFile = path.join(distCliDir, "iris-sync.js");

  if (!fs.existsSync(distCliDir)) {
    fs.mkdirSync(distCliDir, { recursive: true });
  }

  const buildOptions: esbuild.BuildOptions = {
    entryPoints: [path.resolve(__dirname, "../src/headless/cli.ts")],
    bundle: true,
    platform: "node",
    target: "node18",
    outfile,
    banner: { js: "#!/usr/bin/env node\n" },
    define: {
      "__IRIS_SYNC_EXT_VERSION__": JSON.stringify(extensionVersion),
      "__IRIS_SYNC_CLI_VERSION__": JSON.stringify(cliVersion),
      "__IRIS_SYNC_COMPOSITE_VERSION__": JSON.stringify(compositeVersion),
    },
    alias: {
      "vscode": path.resolve(__dirname, "../src/headless/vscode-shim.ts"),
    },
    external: ["keytar"],
    minify: true,
    treeShaking: true,
    sourcemap: true,
  };

  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log(`Watching for changes to rebuild ${outfile}...`);
  } else {
    const result = await esbuild.build(buildOptions);
    if (result.errors.length > 0) {
      console.error("Build failed with errors:", result.errors);
      process.exit(1);
    }
    fs.chmodSync(outfile, 0o755);
    fs.copyFileSync(outfile, canonicalFile);
    fs.chmodSync(canonicalFile, 0o755);

    // Clean up legacy bin/ directory if present
    const legacyBin = path.resolve(__dirname, "../bin/iris-sync.js");
    if (fs.existsSync(legacyBin)) {
      try {
        fs.rmSync(path.dirname(legacyBin), { recursive: true, force: true });
      } catch (_) {}
    }

    console.log(`Successfully compiled standalone CLI binary: ${outfile}`);
    console.log(`Updated canonical entrypoint:               ${canonicalFile}`);
    console.log(`Composite version:                          ${compositeVersion}`);
  }
}

runBuild().catch((err) => {
  console.error(err);
  process.exit(1);
});
