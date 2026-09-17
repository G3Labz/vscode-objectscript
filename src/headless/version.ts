/**
 * src/headless/version.ts
 * Dual-version tracking engine for iris-sync.
 *
 * Tracks the upstream extension build version ("b.<extVersion>") and the
 * standalone CLI build version ("c.<cliVersion>"), yielding the composite
 * release tag and versioned binary filename.
 *
 * Example:
 *   Extension version: 3.8.6-SNAPSHOT
 *   CLI version:       0.0.1-ALPHA
 *   Composite version: b.3.8.6-SNAPSHOT-c.0.0.1-ALPHA
 *   Binary filename:   iris-sync-b.3.8.6-SNAPSHOT-c.0.0.1-ALPHA.js
 *   Git release tag:   b.3.8.6-SNAPSHOT-c.0.0.1-ALPHA
 */

import * as path from "path";
import * as fs from "fs";

declare const __IRIS_SYNC_EXT_VERSION__: string | undefined;
declare const __IRIS_SYNC_CLI_VERSION__: string | undefined;
declare const __IRIS_SYNC_COMPOSITE_VERSION__: string | undefined;

export interface IrisSyncVersions {
  extensionVersion: string;
  cliVersion: string;
  compositeVersion: string;
  binaryFilename: string;
  releaseTag: string;
}

export function getIrisSyncVersions(): IrisSyncVersions {
  let extensionVersion: string;
  let cliVersion: string;

  if (typeof __IRIS_SYNC_EXT_VERSION__ !== "undefined" && typeof __IRIS_SYNC_CLI_VERSION__ !== "undefined") {
    extensionVersion = __IRIS_SYNC_EXT_VERSION__;
    cliVersion = __IRIS_SYNC_CLI_VERSION__;
  } else {
    // Dynamic fallback when running unbundled via tsx or in tests
    try {
      const pkgPath = path.resolve(__dirname, "../../package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      extensionVersion = pkg.version || "3.8.6-SNAPSHOT";
      cliVersion = pkg.cliVersion || "0.0.1-ALPHA";
    } catch (_) {
      extensionVersion = "3.8.6-SNAPSHOT";
      cliVersion = "0.0.1-ALPHA";
    }
  }

  const compositeVersion =
    typeof __IRIS_SYNC_COMPOSITE_VERSION__ !== "undefined"
      ? __IRIS_SYNC_COMPOSITE_VERSION__
      : `b.${extensionVersion}-c.${cliVersion}`;

  const binaryFilename = `iris-sync-${compositeVersion}.js`;
  const releaseTag = compositeVersion;

  return {
    extensionVersion,
    cliVersion,
    compositeVersion,
    binaryFilename,
    releaseTag,
  };
}
