/**
 * build/build.native.ts
 * Standalone Zero-Dependency Native Binary Compiler using Node.js SEA (Milestone M2.4).
 *
 * Compiles iris-sync CLI into a self-contained native executable for the current platform/arch.
 * Eliminates the requirement for Node.js / npm on target environments.
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { getIrisSyncVersions } from "../src/headless/version";

export async function buildNativeBinary(): Promise<{ binaryPath: string; versionedPath: string }> {
  const { extensionVersion, cliVersion, compositeVersion } = getIrisSyncVersions();
  const distDir = path.resolve(__dirname, "../dist/cli");
  const mainJs = path.join(distDir, "iris-sync.js");

  // Step 1: Ensure canonical CLI JS bundle exists
  console.log("Building CLI JavaScript bundle first...");
  execSync("npm run build:cli", { stdio: "inherit", cwd: path.resolve(__dirname, "..") });

  // Step 2: Write SEA configuration file
  const seaConfigPath = path.join(distDir, "sea-config.json");
  const blobPath = path.join(distDir, "sea-prep.blob");
  const seaConfig = {
    main: mainJs,
    output: blobPath,
    disableExperimentalSEAWarning: true,
  };
  fs.writeFileSync(seaConfigPath, JSON.stringify(seaConfig, null, 2), "utf8");

  // Step 3: Generate SEA preparation blob
  console.log(`Generating Single Executable Application blob at ${blobPath}...`);
  execSync(`node --experimental-sea-config "${seaConfigPath}"`, { stdio: "inherit" });

  // Step 4: Determine platform and architecture targets
  const platform = process.platform;
  const arch = process.arch;
  const ext = platform === "win32" ? ".exe" : "";
  const targetName = `iris-sync-${platform}-${arch}${ext}`;
  const versionedTargetName = `iris-sync-b.${extensionVersion}-c.${cliVersion}-${platform}-${arch}${ext}`;

  const targetPath = path.join(distDir, targetName);
  const versionedPath = path.join(distDir, versionedTargetName);

  // Step 5: Copy host node executable
  console.log(`Copying host Node binary (${process.execPath}) to ${targetPath}...`);
  fs.copyFileSync(process.execPath, targetPath);
  fs.chmodSync(targetPath, 0o755);

  // Step 6: Inject SEA blob into executable via postject
  console.log(`Injecting SEA blob into ${targetName}...`);
  const postjectCmd = `npx -y postject "${targetPath}" NODE_SEA_BLOB "${blobPath}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`;
  execSync(postjectCmd, { stdio: "inherit" });

  // Create versioned binary copy as well
  fs.copyFileSync(targetPath, versionedPath);
  fs.chmodSync(versionedPath, 0o755);

  // Step 7: Package compressed archives for universal package managers (mise, asdf, aqua)
  const tarName = `iris-sync-${platform}-${arch}.tar.gz`;
  const versionedTarName = `iris-sync-b.${extensionVersion}-c.${cliVersion}-${platform}-${arch}.tar.gz`;
  const tarPath = path.join(distDir, tarName);
  const versionedTarPath = path.join(distDir, versionedTarName);

  try {
    const stageDir = path.join(distDir, ".stage-tar");
    if (fs.existsSync(stageDir)) fs.rmSync(stageDir, { recursive: true, force: true });
    fs.mkdirSync(stageDir, { recursive: true });
    const stageBin = path.join(stageDir, `iris-sync${ext}`);
    fs.copyFileSync(targetPath, stageBin);
    fs.chmodSync(stageBin, 0o755);

    execSync(`tar -czf "${tarPath}" -C "${stageDir}" "iris-sync${ext}"`);
    fs.copyFileSync(tarPath, versionedTarPath);
    fs.rmSync(stageDir, { recursive: true, force: true });
    console.log(` Created archive:  ${tarPath}`);
    console.log(` Created archive:  ${versionedTarPath}`);
  } catch (err) {
    console.warn(" Could not generate tar archive:", err);
  }

  console.log("\n============================================================");
  console.log(` [PASS] Successfully compiled native standalone binary!`);
  console.log(` Canonical Binary: ${targetPath}`);
  console.log(` Versioned Binary: ${versionedPath}`);
  console.log(` Universal Archive:${tarPath}`);
  console.log(` Target Version:   ${compositeVersion}`);
  console.log("============================================================\n");

  // Step 8: Smoke test executable
  const testOut = execSync(`"${targetPath}" -V`, { encoding: "utf8" }).trim();
  console.log(`Verified execution: ${targetName} -V -> ${testOut}`);

  return { binaryPath: targetPath, versionedPath };
}

if (require.main === module) {
  buildNativeBinary().catch((err) => {
    console.error("Native build failed:", err);
    process.exit(1);
  });
}
