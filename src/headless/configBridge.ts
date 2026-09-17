/**
 * src/headless/configBridge.ts
 * Hierarchical Configuration Resolution Engine & VS Code Configuration Bridge.
 *
 * Implements the two-tier configuration architecture (.iris-sync/config.json, .iris-sync/servers.json)
 * with 12-factor environment variable cascade and zero-config VS Code fallback.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { activeRuntimeConfig } from "./vscode-shim";

export interface ServerSpec {
  name?: string;
  description?: string;
  webServer: {
    scheme: "http" | "https";
    host: string;
    port: number;
    pathPrefix?: string;
  };
  username?: string;
  password?: string;
}

export interface WorkspaceProfile {
  server?: string;
  namespace?: string;
  compileFlags?: string;
  sourceRoot?: string;
  watchPatterns?: string[];
  conflictPolicy?: "fail" | "overwrite" | "pull" | "diff" | "merge";
}

export interface ResolvedConfig {
  serverName: string;
  serverSpec: ServerSpec;
  namespace: string;
  compileFlags: string;
  sourceRoot: string;
  watchPatterns: string[];
  conflictPolicy: "fail" | "overwrite" | "pull" | "diff" | "merge";
  insecure: boolean;
  servers: Record<string, ServerSpec>;
}

export interface CliConfigOverrides {
  profile?: string;
  server?: string;
  namespace?: string;
  flags?: string;
  dir?: string;
  host?: string;
  port?: number;
  scheme?: "http" | "https";
  pathPrefix?: string;
  user?: string;
  password?: string;
  conflict?: "fail" | "overwrite" | "pull" | "diff" | "merge";
  insecure?: boolean;
}

/**
 * Expand shell-like environment variables (${VAR:-default} or ${VAR})
 */
export function interpolateEnv(val: string): string {
  if (typeof val !== "string") return val;
  return val.replace(/\$\{([A-Za-z0-9_]+)(?::-([^}]+))?\}/g, (_match, varName, defaultVal) => {
    return process.env[varName] !== undefined && process.env[varName] !== ""
      ? process.env[varName]!
      : defaultVal || "";
  });
}

function deepInterpolate(obj: any): any {
  if (typeof obj === "string") {
    return interpolateEnv(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(deepInterpolate);
  }
  if (typeof obj === "object" && obj !== null) {
    const res: Record<string, any> = {};
    for (const k of Object.keys(obj)) {
      res[k] = deepInterpolate(obj[k]);
    }
    return res;
  }
  return obj;
}

/**
 * Strip single-line (//) and multi-line (/* *\/) comments, plus trailing commas from JSONC text.
 */
export function stripJsonc(text: string): string {
  const withoutComments = text.replace(
    /\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g,
    (m, g) => (g ? "" : m)
  );
  return withoutComments.replace(/,(\s*[}\]])/g, "$1");
}

/**
 * Safely parse JSON or JSONC string. Returns null on parse error.
 */
export function parseJsoncSafe(content: string): any {
  try {
    return JSON.parse(stripJsonc(content));
  } catch (_) {
    return null;
  }
}

/**
 * Safely read and parse a JSON or JSONC file.
 */
export function readJsonSafe(filePath: string): any {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      return parseJsoncSafe(content);
    }
  } catch (_) {}
  return null;
}

/**
 * Surgically update or insert a setting in JSONC text while preserving developer comments,
 * trailing commas, and formatting.
 */
export function setSettingPreservingJsonc(raw: string, key: string, value: any): string {
  const jsonValue = JSON.stringify(value);
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const keyRegex = new RegExp(`("${escapedKey}"\\s*:\\s*)(?:"(?:\\\\.|[^"\\\\])*"|[\\w.-]+|true|false|null|\\[[^\\]]*\\]|\\{[^}]*\\})`, "g");

  if (keyRegex.test(raw)) {
    return raw.replace(keyRegex, `$1${jsonValue}`);
  }

  const lastBrace = raw.lastIndexOf("}");
  if (lastBrace === -1) {
    return `{\n  "${key}": ${jsonValue}\n}\n`;
  }

  const before = raw.slice(0, lastBrace);
  const after = raw.slice(lastBrace);

  const trimmedBefore = before.trimEnd();
  const strippedBefore = stripJsonc(trimmedBefore).trimEnd();
  const needsComma = strippedBefore.length > 0 && !strippedBefore.endsWith("{") && !strippedBefore.endsWith(",");

  const indent = "  ";
  const insertion = `${needsComma ? ",\n" : "\n"}${indent}"${key}": ${jsonValue}\n`;

  return trimmedBefore + insertion + after;
}


/**
 * Hierarchical resolution of configuration.
 */
export function resolveConfiguration(overrides: CliConfigOverrides = {}): ResolvedConfig {
  const cwd = process.cwd();
  const homeDir = os.homedir();
  const globalDir = path.join(homeDir, ".iris-sync");

  // 1. Discover local files (.iris-sync/)
  const localDir = path.join(cwd, ".iris-sync");
  const localRcPath = path.join(localDir, "config.json");
  const localServersPath = path.join(localDir, "servers.json");
  const localVsCodePath = path.join(cwd, ".vscode", "settings.json");

  // 2. Discover global files (~/.iris-sync/)
  const globalRcPath = path.join(globalDir, "config.json");
  const globalServersPath = path.join(globalDir, "servers.json");

  const localRc = fs.existsSync(localRcPath) ? deepInterpolate(readJsonSafe(localRcPath)) : null;
  const localServers = fs.existsSync(localServersPath) ? deepInterpolate(readJsonSafe(localServersPath)) : null;
  const globalRc = fs.existsSync(globalRcPath) ? deepInterpolate(readJsonSafe(globalRcPath)) : null;
  const globalServers = fs.existsSync(globalServersPath) ? deepInterpolate(readJsonSafe(globalServersPath)) : null;
  const vsCodeSettings = readJsonSafe(localVsCodePath);

  // Merge server catalogs (Local overrides global)
  const serversCatalog: Record<string, ServerSpec> = {};
  if (globalServers?.servers) {
    Object.assign(serversCatalog, globalServers.servers);
  }
  if (localServers?.servers) {
    Object.assign(serversCatalog, localServers.servers);
  }
  // Zero-config ingestion of VS Code intersystems.servers
  if (vsCodeSettings?.["intersystems.servers"]) {
    for (const [k, v] of Object.entries(vsCodeSettings["intersystems.servers"])) {
      if (!serversCatalog[k]) {
        serversCatalog[k] = v as ServerSpec;
      }
    }
  }

  // Active profile selection
  const activeProfileName =
    overrides.profile ||
    process.env.IRIS_PROFILE ||
    localRc?.activeProfile ||
    globalRc?.activeProfile ||
    "development";

  const profileData: WorkspaceProfile =
    localRc?.profiles?.[activeProfileName] ||
    globalRc?.profiles?.[activeProfileName] ||
    {};

  // Target server name resolution
  let serverName =
    overrides.server ||
    process.env.IRIS_SERVER ||
    profileData.server ||
    vsCodeSettings?.["objectscript.conn.server"] ||
    vsCodeSettings?.["objectscript.conn"]?.server ||
    "local-iris";

  // Build target ServerSpec
  let existingSpec = serversCatalog[serverName];
  if (!existingSpec) {
    const lowerKey = serverName.toLowerCase();
    const found = Object.keys(serversCatalog).find((k) => k.toLowerCase() === lowerKey);
    if (found) {
      existingSpec = serversCatalog[found];
    }
  }

  const scheme = overrides.scheme || (process.env.IRIS_SCHEME as any) || existingSpec?.webServer?.scheme || "http";
  const host =
    overrides.host ||
    process.env.IRIS_HOST ||
    existingSpec?.webServer?.host ||
    vsCodeSettings?.["objectscript.conn"]?.host ||
    "127.0.0.1";
  const port =
    overrides.port ||
    (process.env.IRIS_PORT ? parseInt(process.env.IRIS_PORT, 10) : undefined) ||
    existingSpec?.webServer?.port ||
    vsCodeSettings?.["objectscript.conn"]?.port ||
    57772;
  const pathPrefix =
    overrides.pathPrefix !== undefined
      ? overrides.pathPrefix
      : process.env.IRIS_PATH_PREFIX !== undefined
      ? process.env.IRIS_PATH_PREFIX
      : existingSpec?.webServer?.pathPrefix || vsCodeSettings?.["objectscript.conn"]?.pathPrefix || "";
  const username =
    overrides.user ||
    process.env.IRIS_USER ||
    existingSpec?.username ||
    vsCodeSettings?.["objectscript.conn"]?.username ||
    "_SYSTEM";
  const password =
    overrides.password ||
    process.env.IRIS_PASSWORD ||
    existingSpec?.password ||
    vsCodeSettings?.["objectscript.conn"]?.password ||
    "SYS";

  const resolvedServerSpec: ServerSpec = {
    name: serverName,
    description: existingSpec?.description || `Connection to ${host}:${port}`,
    webServer: {
      scheme,
      host,
      port,
      pathPrefix,
    },
    username,
    password,
  };

  serversCatalog[serverName] = resolvedServerSpec;

  const namespace = (
    overrides.namespace ||
    process.env.IRIS_NAMESPACE ||
    profileData.namespace ||
    vsCodeSettings?.["objectscript.conn.ns"] ||
    vsCodeSettings?.["objectscript.conn"]?.ns ||
    "USER"
  ).toUpperCase();

  const compileFlags =
    overrides.flags ||
    process.env.IRIS_COMPILE_FLAGS ||
    profileData.compileFlags ||
    vsCodeSettings?.["objectscript.compileFlags"] ||
    "cuk";

  const sourceRoot =
    overrides.dir ||
    process.env.IRIS_SOURCE_DIR ||
    profileData.sourceRoot ||
    vsCodeSettings?.["objectscript.export.folder"] ||
    vsCodeSettings?.["objectscript.export"]?.folder ||
    "src";

  const watchPatterns = profileData.watchPatterns || [
    path.join(sourceRoot, "**/*.cls"),
    path.join(sourceRoot, "**/*.mac"),
    path.join(sourceRoot, "**/*.inc"),
  ];

  const conflictPolicy: "fail" | "overwrite" | "pull" | "diff" | "merge" =
    overrides.conflict ||
    (process.env.IRIS_CONFLICT_POLICY as any) ||
    profileData.conflictPolicy ||
    (vsCodeSettings?.["objectscript.overwriteServerChanges"] ? "overwrite" : "fail");

  const insecure = overrides.insecure ?? false;

  return {
    serverName,
    serverSpec: resolvedServerSpec,
    namespace,
    compileFlags,
    sourceRoot,
    watchPatterns,
    conflictPolicy,
    insecure,
    servers: serversCatalog,
  };
}

/**
 * Apply resolved configuration to the active runtime shim proxy.
 */
export function applyConfigurationToShim(config: ResolvedConfig): void {
  // 1. Configure objectscript connection and options
  activeRuntimeConfig["objectscript"] = {
    conn: {
      active: true,
      server: config.serverName,
      ns: config.namespace,
      host: config.serverSpec.webServer.host,
      port: config.serverSpec.webServer.port,
      https: config.serverSpec.webServer.scheme === "https",
      pathPrefix: config.serverSpec.webServer.pathPrefix || "",
      username: config.serverSpec.username,
      password: config.serverSpec.password,
    },
    compileFlags: config.compileFlags,
    overwriteServerChanges: config.conflictPolicy === "overwrite",
    export: {
      folder: config.sourceRoot,
    },
    refreshClassesOnSync: false,
    outputRESTTraffic: false,
  };

  // 2. Configure server dictionary for intersystems.servers
  activeRuntimeConfig["intersystems.servers"] = {
    ...config.servers,
    [config.serverName]: config.serverSpec,
    [config.serverName.toLowerCase()]: config.serverSpec,
  };

  // 3. Configure HTTP proxy strict SSL
  activeRuntimeConfig["http"] = {
    proxyStrictSSL: !config.insecure,
  };

  // 4. Configure active conflict resolution policy
  activeRuntimeConfig["conflictPolicy"] = config.conflictPolicy;
}
