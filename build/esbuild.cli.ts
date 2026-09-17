/**
 * build/esbuild.cli.ts
 * Dual-target bundler script assembling standalone iris-sync CLI binary.
 *
 * Implements Pattern A build-time module aliasing:
 * Maps all upstream "vscode" imports to src/headless/vscode-shim.ts
 * and executes aggressive tree-shaking to eliminate UI/editor webviews.
 */

import * as esbuild from "esbuild";
import * as path from "path";
import * as fs from "fs";

async function runBuild() {
  const isWatch = process.argv.includes("--watch");
  const outfile = path.resolve(__dirname, "../bin/iris-sync.js");

  const buildOptions: esbuild.BuildOptions = {
    entryPoints: [path.resolve(__dirname, "../src/headless/cli.ts")],
    bundle: true,
    platform: "node",
    target: "node18",
    outfile,
    banner: { js: "#!/usr/bin/env node\n" },
    alias: {
      "vscode": path.resolve(__dirname, "../src/headless/vscode-shim.ts"),
    },
    external: ["keytar"],
    minify: true,
    treeShaking: true,
    sourcemap: true,
  };

  const binDir = path.dirname(outfile);
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log("Watching for changes to rebuild bin/iris-sync.js...");
  } else {
    const result = await esbuild.build(buildOptions);
    if (result.errors.length > 0) {
      console.error("Build failed with errors:", result.errors);
      process.exit(1);
    }
    fs.chmodSync(outfile, 0o755);
    console.log(`Successfully compiled standalone CLI binary: ${outfile}`);
  }
}

runBuild().catch((err) => {
  console.error(err);
  process.exit(1);
});
