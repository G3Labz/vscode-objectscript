/**
 * src/headless/projectManifest.ts
 *
 * Studio Project Parity & Offline Manifest Management Subsystem for iris-sync.
 * Provides InterSystems Studio (.PRJ / %Studio.Project) parity for local-first
 * file manifests, scoped compilation/watching, and export/deployment pipelines.
 */

import * as fs from "fs";
import * as path from "path";
import { AtelierAPI } from "../api";
import { resolveDocName } from "./cli";
import { logger } from "./terminalLogger";
import { CancellationTokenSource } from "./vscode-shim";

export const PROJECT_SCHEMA_URL =
  "https://raw.githubusercontent.com/G3Labz/vscode-objectscript/master/schemas/irisproject.schema.json";

export interface IrisProjectManifest {
  $schema?: string;
  version?: number;
  name: string;
  description?: string;
  serverProject?: string;
  targetNamespace?: string;
  exportFormat?: "xml" | "udl" | "gof";
  items: string[];
  dependencies?: string[];
}

export interface ServerProjectInfo {
  name: string;
  description?: string;
}

export interface ServerProjectItem {
  name: string;
  type: string;
}

/**
 * Returns the directory path for local project manifests: ./.iris-sync/projects/
 */
export function getProjectsDirectory(cwd?: string): string {
  const root = cwd || process.cwd();
  return path.resolve(root, ".iris-sync", "projects");
}

/**
 * Returns the filepath for a named project manifest: ./.iris-sync/projects/<name>.json
 */
export function getProjectPath(name: string, cwd?: string): string {
  const safeName = name.replace(/\.json$/i, "");
  return path.join(getProjectsDirectory(cwd), `${safeName}.json`);
}

/**
 * Lists all local project manifests found in ./.iris-sync/projects/
 */
export function listProjectManifests(cwd?: string): IrisProjectManifest[] {
  const dir = getProjectsDirectory(cwd);
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const manifests: IrisProjectManifest[] = [];

  for (const file of files) {
    try {
      const fullPath = path.join(dir, file);
      const content = fs.readFileSync(fullPath, "utf8");
      const parsed = JSON.parse(content) as IrisProjectManifest;
      if (parsed && parsed.name) {
        manifests.push(parsed);
      }
    } catch (_) {
      // Ignore invalid JSON manifests
    }
  }

  return manifests.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Loads a project manifest by name from ./.iris-sync/projects/<name>.json
 */
export function loadProjectManifest(name: string, cwd?: string): IrisProjectManifest | null {
  const filePath = getProjectPath(name, cwd);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content) as IrisProjectManifest;
  } catch (err) {
    logger.error(`Failed to parse project manifest '${filePath}': ${err}`);
    return null;
  }
}

/**
 * Saves a project manifest to ./.iris-sync/projects/<name>.json
 */
export function saveProjectManifest(manifest: IrisProjectManifest, cwd?: string): string {
  const dir = getProjectsDirectory(cwd);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filePath = getProjectPath(manifest.name, cwd);
  const data: IrisProjectManifest = {
    $schema: PROJECT_SCHEMA_URL,
    version: manifest.version || 1,
    name: manifest.name,
    description: manifest.description || "",
    serverProject: manifest.serverProject || `${manifest.name}.PRJ`,
    targetNamespace: manifest.targetNamespace || undefined,
    exportFormat: manifest.exportFormat || "xml",
    items: Array.from(new Set(manifest.items || [])),
    dependencies: manifest.dependencies && manifest.dependencies.length > 0 ? manifest.dependencies : undefined,
  };

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
  return filePath;
}

/**
 * Creates a new project manifest and writes it to disk.
 */
export function createProjectManifest(
  name: string,
  options: Partial<IrisProjectManifest> = {},
  cwd?: string
): IrisProjectManifest {
  const manifest: IrisProjectManifest = {
    $schema: PROJECT_SCHEMA_URL,
    version: 1,
    name,
    description: options.description || "",
    serverProject: options.serverProject || `${name}.PRJ`,
    targetNamespace: options.targetNamespace,
    exportFormat: options.exportFormat || "xml",
    items: options.items || [],
    dependencies: options.dependencies || [],
  };

  saveProjectManifest(manifest, cwd);
  return manifest;
}

/**
 * Normalizes a workspace-relative file path for consistent manifest storage.
 */
export function normalizeItemPath(itemPath: string, cwd?: string): string {
  const root = cwd || process.cwd();
  const abs = path.isAbsolute(itemPath) ? itemPath : path.resolve(root, itemPath);
  let rel = path.relative(root, abs).replace(/\\/g, "/");
  if (rel.startsWith("./")) {
    rel = rel.substring(2);
  }
  return rel;
}

/**
 * Adds one or more items to an existing project manifest.
 */
export function addItemsToProject(name: string, itemsToAdd: string[], cwd?: string): IrisProjectManifest {
  const manifest = loadProjectManifest(name, cwd);
  if (!manifest) {
    throw new Error(`Project manifest '${name}' not found.`);
  }

  const existingSet = new Set(manifest.items.map((i) => i.replace(/\\/g, "/")));

  for (const item of itemsToAdd) {
    const normalized = normalizeItemPath(item, cwd);
    if (!existingSet.has(normalized)) {
      manifest.items.push(normalized);
      existingSet.add(normalized);
    }
  }

  saveProjectManifest(manifest, cwd);
  return manifest;
}

/**
 * Removes one or more items from an existing project manifest.
 */
export function removeItemsFromProject(name: string, itemsToRemove: string[], cwd?: string): IrisProjectManifest {
  const manifest = loadProjectManifest(name, cwd);
  if (!manifest) {
    throw new Error(`Project manifest '${name}' not found.`);
  }

  const removeSet = new Set(itemsToRemove.map((i) => normalizeItemPath(i, cwd)));
  manifest.items = manifest.items.filter((item) => !removeSet.has(item.replace(/\\/g, "/")));

  saveProjectManifest(manifest, cwd);
  return manifest;
}

/**
 * Infers InterSystems Studio Item Type from document or file name.
 */
export function inferStudioItemType(docOrFileName: string): string {
  const ext = path.extname(docOrFileName).toLowerCase();
  switch (ext) {
    case ".cls":
      return "CLS";
    case ".mac":
      return "MAC";
    case ".int":
      return "INT";
    case ".inc":
      return "INC";
    case ".csp":
      return "CSP";
    case ".dfi":
      return "DFI";
    case ".prj":
      return "PRJ";
    default:
      return "OTH";
  }
}

/**
 * Resolves an item path to its authoritative server document name.
 */
export function itemToDocName(item: string, sourceRoot?: string): string {
  const root = sourceRoot || process.cwd();
  const absPath = path.isAbsolute(item) ? item : path.resolve(root, item);
  if (fs.existsSync(absPath)) {
    return resolveDocName(absPath, root);
  }
  // If file does not exist locally, infer from filename
  return path.basename(item);
}

// ---------------------------------------------------------------------------
// Server-Side %Studio.Project SQL Bridge
// ---------------------------------------------------------------------------

/**
 * Queries the active IRIS server for all registered %Studio.Project records.
 */
export async function queryServerProjects(api: AtelierAPI): Promise<ServerProjectInfo[]> {
  try {
    const res = await api.actionQuery("SELECT Name, Description FROM %Studio.Project ORDER BY Name", []);
    if (res && res.result && Array.isArray(res.result.content)) {
      return res.result.content.map((row: any) => ({
        name: row.Name,
        description: row.Description || "",
      }));
    }
    return [];
  } catch (err: any) {
    logger.warn(`Could not query %Studio.Project on server: ${err?.message || err}`);
    return [];
  }
}

/**
 * Queries the items registered in a server %Studio.Project.
 */
export async function queryServerProjectItems(api: AtelierAPI, projectName: string): Promise<ServerProjectItem[]> {
  try {
    const cleanName = projectName.replace(/\.prj$/i, "");
    const res = await api.actionQuery(
      "SELECT Name, Type FROM %Studio.Project_ProjectItemsList(?,1) WHERE Type != 'GBL' ORDER BY Name",
      [cleanName]
    );
    if (res && res.result && Array.isArray(res.result.content)) {
      return res.result.content.map((row: any) => ({
        name: row.Name,
        type: row.Type,
      }));
    }
    return [];
  } catch (err: any) {
    logger.warn(`Could not query items for server project '${projectName}': ${err?.message || err}`);
    return [];
  }
}

/**
 * Ensures a %Studio.Project entry exists on the remote IRIS server.
 */
export async function ensureServerProject(
  api: AtelierAPI,
  projectName: string,
  description = ""
): Promise<void> {
  const cleanName = projectName.replace(/\.prj$/i, "");
  const existing = await queryServerProjects(api);
  const found = existing.some((p) => p.name.toLowerCase() === cleanName.toLowerCase());

  if (!found) {
    await api.actionQuery(
      "INSERT INTO %Studio.Project (Name, Description, LastModified) VALUES (?, ?, NOW())",
      [cleanName, description]
    );
  }
}

/**
 * Adds an item to the server's %Studio.ProjectItem table.
 */
export async function addServerProjectItem(
  api: AtelierAPI,
  projectName: string,
  itemName: string,
  itemType: string
): Promise<void> {
  const cleanName = projectName.replace(/\.prj$/i, "");
  await ensureServerProject(api, cleanName);

  // Check if item already exists
  const existing = await queryServerProjectItems(api, cleanName);
  const alreadyInProject = existing.some(
    (i) => i.name.toLowerCase() === itemName.toLowerCase() && i.type.toLowerCase() === itemType.toLowerCase()
  );

  if (!alreadyInProject) {
    await api.actionQuery("INSERT INTO %Studio.ProjectItem (Project, Name, Type) VALUES (?, ?, ?)", [
      cleanName,
      itemName,
      itemType,
    ]);
    await api.actionQuery("UPDATE %Studio.Project SET LastModified = NOW() WHERE Name = ?", [cleanName]).catch(() => {});
  }
}

/**
 * Bi-directionally synchronizes a project manifest between local disk and IRIS server.
 */
export async function syncProjectManifestWithServer(
  manifest: IrisProjectManifest,
  api: AtelierAPI,
  direction: "local-to-server" | "server-to-local" | "bidirectional" = "bidirectional",
  cwd?: string
): Promise<{ addedToLocal: string[]; addedToServer: string[] }> {
  const root = cwd || process.cwd();
  const cleanPrjName = (manifest.serverProject || `${manifest.name}.PRJ`).replace(/\.prj$/i, "");

  await ensureServerProject(api, cleanPrjName, manifest.description || "");

  const serverItems = await queryServerProjectItems(api, cleanPrjName);
  const localDocMap = new Map<string, string>(); // docName -> localRelPath

  for (const item of manifest.items) {
    const doc = itemToDocName(item, root);
    localDocMap.set(doc.toLowerCase(), item);
  }

  const addedToLocal: string[] = [];
  const addedToServer: string[] = [];

  // Reconcile Local -> Server
  if (direction === "local-to-server" || direction === "bidirectional") {
    for (const item of manifest.items) {
      const doc = itemToDocName(item, root);
      const type = inferStudioItemType(doc);
      const foundOnServer = serverItems.some(
        (si) => si.name.toLowerCase() === doc.toLowerCase() || `${si.name}.${si.type.toLowerCase()}` === doc.toLowerCase()
      );

      if (!foundOnServer) {
        // Strip extension if type is CLS to match Studio convention
        const studioDocName = type === "CLS" && doc.endsWith(".cls") ? doc.slice(0, -4) : doc;
        await addServerProjectItem(api, cleanPrjName, studioDocName, type);
        addedToServer.push(doc);
      }
    }
  }

  // Reconcile Server -> Local
  if (direction === "server-to-local" || direction === "bidirectional") {
    for (const sItem of serverItems) {
      const fullDoc = sItem.type === "CLS" ? `${sItem.name}.cls` : sItem.name;
      if (!localDocMap.has(fullDoc.toLowerCase())) {
        manifest.items.push(fullDoc);
        addedToLocal.push(fullDoc);
      }
    }
  }

  if (addedToLocal.length > 0) {
    saveProjectManifest(manifest, cwd);
  }

  return { addedToLocal, addedToServer };
}

// ---------------------------------------------------------------------------
// Export & Promotion / Deploy Pipelines
// ---------------------------------------------------------------------------

/**
 * Exports all project items into an InterSystems XML deployment package.
 */
export async function exportProjectToXml(
  manifest: IrisProjectManifest,
  api: AtelierAPI,
  outputPath: string,
  cwd?: string
): Promise<string> {
  const root = cwd || process.cwd();
  const absOut = path.isAbsolute(outputPath) ? outputPath : path.resolve(root, outputPath);

  const docNames: string[] = [];
  for (const item of manifest.items) {
    docNames.push(itemToDocName(item, root));
  }

  if (docNames.length === 0) {
    throw new Error(`Project '${manifest.name}' contains no items to export.`);
  }

  // Attempt Atelier v7+ XML export endpoint
  let xmlContent = "";
  try {
    const res = await api.actionXMLExport(docNames);
    if (res && res.result && Array.isArray(res.result.content)) {
      xmlContent = res.result.content.join("\n");
    }
  } catch (err: any) {
    logger.warn(`Atelier actionXMLExport failed: ${err?.message || err}. Falling back to document synthesis.`);
  }

  // Fallback: If actionXMLExport is unavailable, fetch UDL docs and wrap in Export container
  if (!xmlContent) {
    const lines: string[] = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<Export generator="iris-sync" version="25">`,
    ];

    for (const doc of docNames) {
      try {
        const docRes = await api.getDoc(doc);
        if (docRes && docRes.result && Array.isArray(docRes.result.content)) {
          lines.push(`<Document name="${doc}">`);
          lines.push(docRes.result.content.join("\n"));
          lines.push(`</Document>`);
        }
      } catch (e: any) {
        logger.warn(`Could not export doc '${doc}': ${e?.message || e}`);
      }
    }

    lines.push(`</Export>`);
    xmlContent = lines.join("\n");
  }

  const outDir = path.dirname(absOut);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(absOut, xmlContent, "utf8");
  return absOut;
}

/**
 * Exports all project items into a structured UDL folder hierarchy.
 */
export async function exportProjectToUdl(
  manifest: IrisProjectManifest,
  api: AtelierAPI,
  outputDir: string,
  cwd?: string
): Promise<string[]> {
  const root = cwd || process.cwd();
  const absOut = path.isAbsolute(outputDir) ? outputDir : path.resolve(root, outputDir);

  if (!fs.existsSync(absOut)) {
    fs.mkdirSync(absOut, { recursive: true });
  }

  const exportedFiles: string[] = [];

  for (const item of manifest.items) {
    const docName = itemToDocName(item, root);
    try {
      const res = await api.getDoc(docName);
      if (res && res.result && Array.isArray(res.result.content)) {
        const destFile = path.join(absOut, path.basename(item));
        fs.writeFileSync(destFile, res.result.content.join("\n"), "utf8");
        exportedFiles.push(destFile);
      }
    } catch (err: any) {
      logger.warn(`Could not fetch UDL for '${docName}': ${err?.message || err}`);
    }
  }

  return exportedFiles;
}

export interface ProjectImportOptions {
  compile?: boolean;
  flags?: string;
  cwd?: string;
}

export interface ProjectImportResult {
  fileOrDir: string;
  format: "xml" | "udl";
  importedDocs: string[];
  compileSuccess: boolean;
  errors?: string[];
}

/**
 * Ingests and compiles exported project packages on target IRIS server headlessly.
 * Supports InterSystems XML deployment packages (.xml) and structured UDL bundle folders.
 */
export async function importProjectPackage(
  packagePath: string,
  api: AtelierAPI,
  options: ProjectImportOptions = {}
): Promise<ProjectImportResult> {
  const root = options.cwd || process.cwd();
  const absPath = path.isAbsolute(packagePath) ? packagePath : path.resolve(root, packagePath);

  if (!fs.existsSync(absPath)) {
    throw new Error(`Package path does not exist: ${packagePath}`);
  }

  const stat = fs.statSync(absPath);
  const importedDocs: string[] = [];
  const errors: string[] = [];
  let format: "xml" | "udl" = "xml";

  if (stat.isDirectory()) {
    format = "udl";
    // Walk directory and ingest all code documents
    const codeFiles: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if ([".cls", ".mac", ".int", ".inc", ".csp", ".dfi", ".prj"].includes(ext)) {
            codeFiles.push(full);
          }
        }
      }
    };
    walk(absPath);

    if (codeFiles.length === 0) {
      throw new Error(`No InterSystems source files found in directory: ${packagePath}`);
    }

    for (const filePath of codeFiles) {
      try {
        const docName = resolveDocName(filePath, absPath);
        const content = fs.readFileSync(filePath, "utf8");
        const lines = content.split(/\r?\n/);
        await api.putDoc(docName, { enc: false, content: lines, mtime: 0 }, true);
        importedDocs.push(docName);
      } catch (err: any) {
        const msg = `Failed to put document from '${filePath}': ${err?.message || err}`;
        logger.error(msg);
        errors.push(msg);
      }
    }
  } else {
    // Single file: XML package or individual document
    format = "xml";
    const content = fs.readFileSync(absPath, "utf8");
    const lines = content.split(/\r?\n/);
    const fileName = path.basename(absPath);

    let loadedViaAtelier = false;
    try {
      const res = await api.actionXMLLoad([{ file: fileName, content: lines }]);
      if (res && res.result && Array.isArray(res.result.content)) {
        for (const item of res.result.content) {
          if (Array.isArray(item.imported)) {
            importedDocs.push(...item.imported);
          }
          if (item.status && item.status.toLowerCase().includes("error")) {
            errors.push(item.status);
          }
        }
        loadedViaAtelier = true;
      }
    } catch (err: any) {
      logger.warn(`Atelier actionXMLLoad failed: ${err?.message || err}. Falling back to document synthesis parsing.`);
    }

    // Fallback: If actionXMLLoad failed or returned no imported documents, parse XML tags
    if (!loadedViaAtelier || importedDocs.length === 0) {
      // 1. Check for synthetic <Document name="...">...</Document>
      const docRegex = /<Document\s+name="([^"]+)">([\s\S]*?)<\/Document>/gi;
      let match: RegExpExecArray | null;
      let parsedAny = false;

      while ((match = docRegex.exec(content)) !== null) {
        parsedAny = true;
        const docName = match[1];
        const docBody = match[2];
        const docLines = docBody.replace(/^\r?\n/, "").replace(/\r?\n$/, "").split(/\r?\n/);
        try {
          await api.putDoc(docName, { enc: false, content: docLines, mtime: 0 }, true);
          importedDocs.push(docName);
        } catch (err: any) {
          const msg = `Failed to put document '${docName}': ${err?.message || err}`;
          logger.error(msg);
          errors.push(msg);
        }
      }

      // 2. If no synthetic <Document> tags found, check for standard Studio XML elements (<Class>, <Routine>)
      if (!parsedAny) {
        try {
          const cvtRes = await api.cvtXmlUdl(content);
          if (cvtRes && cvtRes.result && Array.isArray(cvtRes.result.content)) {
            for (const item of cvtRes.result.content as any[]) {
              const name = item.name || item.docName;
              if (name && item.content) {
                const docLines = Array.isArray(item.content) ? item.content : item.content.split(/\r?\n/);
                await api.putDoc(name, { enc: false, content: docLines, mtime: 0 }, true);
                importedDocs.push(name);
                parsedAny = true;
              }
            }
          }
        } catch (_) {
          // cvtXmlUdl not supported or failed
        }

        if (!parsedAny) {
          const classRegex = /<Class\s+name="([^"]+)">/gi;
          const classes: string[] = [];
          let cMatch: RegExpExecArray | null;
          while ((cMatch = classRegex.exec(content)) !== null) {
            classes.push(cMatch[1]);
          }
          if (classes.length > 0) {
            try {
              await api.actionQuery("SELECT %SYSTEM_OBJ.Load(?, 'cku-d') AS Status", [absPath]);
              classes.forEach((c) => importedDocs.push(`${c}.cls`));
              parsedAny = true;
            } catch (loadErr: any) {
              errors.push(`Could not execute %SYSTEM.OBJ.Load on server: ${loadErr?.message || loadErr}`);
            }
          }
        }
      }
    }
  }

  // De-duplicate imported documents
  const uniqueDocs = Array.from(new Set(importedDocs));

  let compileSuccess = true;
  if (options.compile !== false && uniqueDocs.length > 0) {
    try {
      const cts = new CancellationTokenSource();
      const flags = options.flags || "cuk";
      const compileRes = await api.asyncCompile(uniqueDocs, cts.token, flags);
      if (compileRes.status && compileRes.status.errors && compileRes.status.errors.length) {
        compileSuccess = false;
        errors.push(
          ...compileRes.status.errors.map((e: any) => (typeof e === "string" ? e : e.msg || JSON.stringify(e)))
        );
      }
    } catch (compileErr: any) {
      compileSuccess = false;
      errors.push(`Compilation error: ${compileErr?.message || compileErr}`);
    }
  }

  return {
    fileOrDir: absPath,
    format,
    importedDocs: uniqueDocs,
    compileSuccess,
    errors: errors.length > 0 ? errors : undefined,
  };
}
