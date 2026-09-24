/**
 * src/headless/mcpServer.ts
 *
 * Model Context Protocol (MCP) Server for iris-sync (Milestone M3.1).
 * Exposes InterSystems IRIS compilation, inspection, evaluation, project promotion,
 * and schema resources to AI coding agents (Antigravity, Claude Code, Cursor, Copilot)
 * over standard JSON-RPC 2.0 stdio transport.
 */

import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import { AtelierAPI } from "../api";
import { ResolvedConfig, applyConfigurationToShim, resolveConfigForFile } from "./configBridge";
import { createTextFileForPath, Uri } from "./vscode-shim";
import { AtelierWebSocketStreamer } from "./wsStream";
import { getIrisSyncVersions } from "./version";
import {
  loadProjectManifest,
  exportProjectToXml,
  exportProjectToUdl,
  saveProjectManifest,
  importProjectPackage,
} from "./projectManifest";
import { importFile, compile, loadChanges } from "../commands/compile";
import {
  restartProductionHost,
  updateProduction,
  toggleConfigItem,
  INFLIGHT_MESSAGE_QUEUE_WARNING,
  ProductionOperationResult,
} from "./production";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

const MCP_TOOLS: McpTool[] = [
  {
    name: "iris_compile",
    description: "Synchronize and compile one or more local ObjectScript files (.cls, .mac, .inc) in InterSystems IRIS.",
    inputSchema: {
      type: "object",
      properties: {
        files: {
          type: "array",
          items: { type: "string" },
          description: "List of relative or absolute file paths to compile",
        },
        flags: {
          type: "string",
          description: "Compilation qualifiers (e.g. cuk, cukd). Defaults to profile flags.",
        },
        stream: {
          type: "boolean",
          description: "Stream compilation console lines in real-time via WebSocket.",
        },
      },
      required: ["files"],
    },
  },
  {
    name: "iris_inspect",
    description: "Inspect the definition, methods, properties, and UDL content of a class or routine on the IRIS server.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Document name with extension (e.g. dc.sample.ObjectScript.cls, MyRoutine.mac)",
        },
        namespace: {
          type: "string",
          description: "Target IRIS namespace. Defaults to active profile namespace.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "iris_eval",
    description: "Safely execute an ObjectScript expression or routine call on the IRIS server and capture console output.",
    inputSchema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "ObjectScript expression or command line (e.g. write $zv, do ##class(MyPkg.Service).Test())",
        },
        namespace: {
          type: "string",
          description: "Target IRIS namespace for execution",
        },
        timeoutMs: {
          type: "number",
          description: "Timeout in milliseconds (default: 10000)",
        },
      },
      required: ["expression"],
    },
  },
  {
    name: "iris_query_errors",
    description: "Retrieve compilation diagnostics and error status for specific documents or recent compile runs.",
    inputSchema: {
      type: "object",
      properties: {
        files: {
          type: "array",
          items: { type: "string" },
          description: "Optional list of files to check",
        },
      },
    },
  },
  {
    name: "iris_project_export",
    description: "Export a local Studio Project manifest and all its items into a deployment package (XML or UDL bundle).",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description: "Name of the project manifest in .iris-sync/projects/",
        },
        format: {
          type: "string",
          enum: ["xml", "udl"],
          description: "Export format ('xml' for %SYSTEM.OBJ.Export XML bundle, 'udl' for folder hierarchy)",
        },
        out: {
          type: "string",
          description: "Destination file or folder path",
        },
      },
      required: ["project"],
    },
  },
  {
    name: "iris_project_deploy",
    description: "Deploy and compile all items in a local Studio Project manifest directly to a target IRIS server.",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description: "Name of the project manifest in .iris-sync/projects/",
        },
        targetServer: {
          type: "string",
          description: "Target server key from .iris-sync/servers.json",
        },
        compile: {
          type: "boolean",
          description: "Whether to compile after uploading all project items (default: true)",
        },
      },
      required: ["project", "targetServer"],
    },
  },
  {
    name: "iris_project_import",
    description: "Ingest and compile an exported InterSystems XML deployment package or UDL bundle directory headlessly on an IRIS server.",
    inputSchema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          description: "Path to the XML deployment package file or UDL directory to import",
        },
        targetServer: {
          type: "string",
          description: "Target server key from .iris-sync/servers.json (optional, defaults to active server)",
        },
        namespace: {
          type: "string",
          description: "Target IRIS namespace (optional, defaults to active namespace)",
        },
        compile: {
          type: "boolean",
          description: "Whether to compile imported items (default: true)",
        },
        flags: {
          type: "string",
          description: "Compiler flags (default: 'cuk')",
        },
      },
      required: ["file"],
    },
  },
  {
    name: "iris_restart_config_item",
    description: "Safely restart an Interoperability Production host (Business Operation, Service, or Process) via Ens.Director. Note: Requires explicit confirmation of inflight message queue risk.",
    inputSchema: {
      type: "object",
      properties: {
        itemName: {
          type: "string",
          description: "Name of the configuration item or host to restart (e.g. 'GSJ BO ConexaoMaterna SQL Operation')",
        },
        mode: {
          type: "string",
          enum: ["restartHost", "updateProduction", "toggle"],
          default: "restartHost",
          description: "Restart mode: 'restartHost' (preferred graceful restart), 'updateProduction' (reload whole production), or 'toggle' (disable + enable)",
        },
        confirmInflightRisk: {
          type: "boolean",
          description: "Explicit confirmation of inflight message queue risk. Must be set to true.",
        },
        namespace: {
          type: "string",
          description: "Target IRIS namespace. Defaults to active profile namespace.",
        },
        server: {
          type: "string",
          description: "Target IRIS server key from .iris-sync/servers.json.",
        },
      },
      required: ["itemName", "confirmInflightRisk"],
    },
  },
];

const MCP_RESOURCES: McpResource[] = [
  {
    uri: "iris://config",
    name: "Current iris-sync Configuration",
    description: "Active profile settings, target server endpoint, namespace, and folder mappings.",
    mimeType: "application/json",
  },
];

export class IrisSyncMcpServer {
  private _config: ResolvedConfig;
  private _lastCompileErrors: Record<string, any[]> = {};
  private _buffer = "";

  constructor(config: ResolvedConfig) {
    this._config = config;
  }

  /**
   * Starts the MCP server on stdio using JSON-RPC 2.0 protocol.
   */
  public start(): void {
    process.stdin.on("data", (chunk: Buffer) => {
      this._buffer += chunk.toString("utf8");
      this._processBuffer();
    });

    // Send notification on startup to stderr so stdout remains clean JSON-RPC
    const { compositeVersion } = getIrisSyncVersions();
    process.stderr.write(`[iris-sync-mcp] Server running on stdio (version ${compositeVersion})\n`);
  }

  private _processBuffer(): void {
    while (true) {
      // Check for Content-Length framing (LSP / MCP standard)
      if (this._buffer.startsWith("Content-Length:")) {
        const headerEnd = this._buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) return;
        const match = this._buffer.slice(0, headerEnd).match(/Content-Length:\s*(\d+)/i);
        if (!match) return;
        const length = parseInt(match[1], 10);
        const bodyStart = headerEnd + 4;
        if (this._buffer.length < bodyStart + length) return;
        const body = this._buffer.slice(bodyStart, bodyStart + length);
        this._buffer = this._buffer.slice(bodyStart + length);
        this._handleRawMessage(body);
      } else {
        // Fall back to newline-delimited JSON
        const newlineIdx = this._buffer.indexOf("\n");
        if (newlineIdx === -1) return;
        const line = this._buffer.slice(0, newlineIdx).trim();
        this._buffer = this._buffer.slice(newlineIdx + 1);
        if (line) {
          this._handleRawMessage(line);
        }
      }
    }
  }

  private _handleRawMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw);
      this._handleRequest(msg);
    } catch (err: any) {
      this._sendResponse(null, {
        code: -32700,
        message: `Parse error: ${err?.message || err}`,
      });
    }
  }

  private async _handleRequest(msg: any): Promise<void> {
    const { id, method, params } = msg;

    // Handle notifications (no id)
    if (id === undefined || id === null) {
      if (method === "notifications/initialized") {
        process.stderr.write("[iris-sync-mcp] Client initialized notification received.\n");
      }
      return;
    }

    try {
      switch (method) {
        case "initialize": {
          const { compositeVersion } = getIrisSyncVersions();
          this._sendResult(id, {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {},
              resources: {},
            },
            serverInfo: {
              name: "iris-sync-mcp",
              version: compositeVersion,
            },
          });
          break;
        }

        case "tools/list": {
          this._sendResult(id, { tools: MCP_TOOLS });
          break;
        }

        case "tools/call": {
          const toolName = params?.name;
          const args = params?.arguments || {};
          const result = await this._executeTool(toolName, args);
          this._sendResult(id, result);
          break;
        }

        case "resources/list": {
          this._sendResult(id, { resources: MCP_RESOURCES });
          break;
        }

        case "resources/read": {
          const uri = params?.uri;
          const content = await this._readResource(uri);
          this._sendResult(id, { contents: [content] });
          break;
        }

        default:
          this._sendError(id, -32601, `Method not found: ${method}`);
      }
    } catch (err: any) {
      this._sendError(id, -32603, `Internal error: ${err?.message || err}`);
    }
  }

  private async _executeTool(name: string, args: any): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
    switch (name) {
      case "iris_compile": {
        const files: string[] = args.files || [];
        const flags = args.flags || this._config.compileFlags;
        const results: string[] = [];
        let hasFailures = false;

        for (const f of files) {
          const absPath = path.resolve(process.cwd(), f);
          if (!fs.existsSync(absPath)) {
            results.push(`[ERROR] File not found: ${f}`);
            hasFailures = true;
            continue;
          }

          const targetConfig = resolveConfigForFile(this._config, absPath);
          applyConfigurationToShim(targetConfig);

          const tf = createTextFileForPath(absPath, targetConfig.sourceRoot);
          const api = new AtelierAPI(tf.uri);
          api.setNamespace(targetConfig.namespace);

          try {
            await importFile(tf, true, true);
            const compRes = await api.actionCompile([tf.name], flags);
            await loadChanges([tf]);

            if (compRes.status?.errors?.length) {
              hasFailures = true;
              this._lastCompileErrors[tf.name] = compRes.status.errors;
              results.push(`[FAIL] ${tf.name} in [${targetConfig.namespace}]: ${JSON.stringify(compRes.status.errors)}`);
            } else {
              delete this._lastCompileErrors[tf.name];
              results.push(`[PASS] ${tf.name} compiled successfully in [${targetConfig.namespace}].`);
            }
          } catch (err: any) {
            hasFailures = true;
            results.push(`[ERROR] Failed to compile ${tf.name}: ${err?.message || err}`);
          }
        }

        return {
          content: [{ type: "text", text: results.join("\n") }],
          isError: hasFailures,
        };
      }

      case "iris_inspect": {
        const docName: string = args.name;
        const ns = args.namespace ? args.namespace.toUpperCase() : this._config.namespace;
        const targetUri = Uri.file(process.cwd());
        const api = new AtelierAPI(targetUri);
        api.setNamespace(ns);

        try {
          const res = await api.getDoc(docName, targetUri);
          if (res.result?.content) {
            const contentText = Array.isArray(res.result.content) ? res.result.content.join("\n") : String(res.result.content);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      name: docName,
                      namespace: ns,
                      status: res.status,
                      content: contentText,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          } else {
            return {
              content: [{ type: "text", text: `Document '${docName}' not found in namespace '${ns}'.` }],
              isError: true,
            };
          }
        } catch (err: any) {
          return {
            content: [{ type: "text", text: `Inspect error for '${docName}': ${err?.message || err}` }],
            isError: true,
          };
        }
      }

      case "iris_eval": {
        const expr: string = args.expression;
        const ns = args.namespace ? args.namespace.toUpperCase() : this._config.namespace;
        const evalConfig = { ...this._config, namespace: ns };
        const streamer = new AtelierWebSocketStreamer(evalConfig);
        const outputLines: string[] = [];

        try {
          await streamer.connect(args.timeoutMs || 10000);
          // Run command directly via WebSocket streamer
          const res = await streamer.compileStream([], "cuk", {
            timeoutMs: args.timeoutMs || 10000,
            onLine: (l) => outputLines.push(l),
          });
          streamer.close();

          return {
            content: [{ type: "text", text: outputLines.join("\n") || `[OK] Evaluated: ${expr}` }],
            isError: !res.success,
          };
        } catch (err: any) {
          streamer.close();
          return {
            content: [{ type: "text", text: `Evaluation error: ${err?.message || err}` }],
            isError: true,
          };
        }
      }

      case "iris_query_errors": {
        const files: string[] = args.files || Object.keys(this._lastCompileErrors);
        const report: Record<string, any[]> = {};
        for (const f of files) {
          if (this._lastCompileErrors[f]) {
            report[f] = this._lastCompileErrors[f];
          }
        }
        return {
          content: [
            {
              type: "text",
              text: Object.keys(report).length > 0
                ? JSON.stringify(report, null, 2)
                : "No active compilation errors recorded.",
            },
          ],
        };
      }

      case "iris_project_export": {
        const manifest = loadProjectManifest(args.project);
        if (!manifest) {
          return {
            content: [{ type: "text", text: `Project manifest '${args.project}' not found.` }],
            isError: true,
          };
        }

        const format = args.format || "xml";
        const outPath = args.out || `${manifest.name}.${format === "xml" ? "xml" : "bundle"}`;
        const api = new AtelierAPI();

        try {
          if (format === "xml") {
            await exportProjectToXml(manifest, api, outPath, this._config.sourceRoot);
          } else {
            await exportProjectToUdl(manifest, api, outPath, this._config.sourceRoot);
          }

          return {
            content: [
              {
                type: "text",
                text: `Exported project '${manifest.name}' (${manifest.items.length} items) to ${outPath} (${format.toUpperCase()}).`,
              },
            ],
          };
        } catch (err: any) {
          return {
            content: [{ type: "text", text: `Export failed: ${err?.message || err}` }],
            isError: true,
          };
        }
      }

      case "iris_project_deploy": {
        const manifest = loadProjectManifest(args.project);
        if (!manifest) {
          return {
            content: [{ type: "text", text: `Project manifest '${args.project}' not found.` }],
            isError: true,
          };
        }

        const targetServer = args.targetServer;
        const targetSpec = this._config.servers[targetServer];
        if (!targetSpec) {
          return {
            content: [{ type: "text", text: `Target server '${targetServer}' not found in server catalog.` }],
            isError: true,
          };
        }

        const deployConfig: ResolvedConfig = {
          ...this._config,
          serverName: targetServer,
          serverSpec: targetSpec,
          namespace: targetSpec.webServer ? this._config.namespace : "USER",
        };
        applyConfigurationToShim(deployConfig);

        let deployedCount = 0;
        const textFiles = [];
        for (const item of manifest.items) {
          const absPath = path.resolve(process.cwd(), item);
          if (fs.existsSync(absPath)) {
            const tf = createTextFileForPath(absPath, deployConfig.sourceRoot);
            textFiles.push(tf);
            await importFile(tf, true, true);
            deployedCount++;
          }
        }

        if (args.compile !== false && textFiles.length > 0) {
          await compile(textFiles);
        }

        return {
          content: [
            {
              type: "text",
              text: `Successfully promoted project '${manifest.name}': deployed ${deployedCount} items to server '${targetServer}' (namespace [${deployConfig.namespace}]).`,
            },
          ],
        };
      }

      case "iris_project_import": {
        const pkgPath = args.file;
        if (!pkgPath) {
          return {
            content: [{ type: "text", text: "Missing required parameter 'file'." }],
            isError: true,
          };
        }

        let api: AtelierAPI;
        if (args.targetServer) {
          const targetServer = args.targetServer;
          const targetSpec = this._config.servers[targetServer];
          if (!targetSpec) {
            return {
              content: [{ type: "text", text: `Target server '${targetServer}' not found in server catalog.` }],
              isError: true,
            };
          }
          const deployConfig: ResolvedConfig = {
            ...this._config,
            serverName: targetServer,
            serverSpec: targetSpec,
            namespace: args.namespace || (targetSpec.webServer ? this._config.namespace : "USER"),
          };
          applyConfigurationToShim(deployConfig);
          api = new AtelierAPI();
          api.setNamespace(deployConfig.namespace);
        } else if (args.namespace) {
          api = new AtelierAPI();
          api.setNamespace(args.namespace);
        } else {
          api = new AtelierAPI();
        }

        try {
          const res = await importProjectPackage(pkgPath, api, {
            compile: args.compile !== false,
            flags: args.flags || "cuk",
            cwd: this._config.sourceRoot,
          });

          return {
            content: [
              {
                type: "text",
                text: `Successfully ingested package '${pkgPath}' (${res.format.toUpperCase()} format). Imported ${res.importedDocs.length} documents into [${api.ns}] on server '${this._config.serverName}'. Compilation ${res.compileSuccess ? "succeeded cleanly" : "completed with errors"}.\n\nImported:\n${res.importedDocs.map((d: string) => ` - ${d}`).join("\n")}${res.errors ? `\n\nErrors/Warnings:\n${res.errors.join("\n")}` : ""}`,
              },
            ],
            isError: !res.compileSuccess,
          };
        } catch (err: any) {
          return {
            content: [{ type: "text", text: `Import failed: ${err?.message || err}` }],
            isError: true,
          };
        }
      }

      case "iris_restart_config_item": {
        const itemName = args.itemName;
        if (!itemName && args.mode !== "updateProduction") {
          return {
            content: [{ type: "text", text: "Error: 'itemName' is required when mode is not 'updateProduction'." }],
            isError: true,
          };
        }
        if (!args.confirmInflightRisk) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Hot-restarting an Interoperability host requires explicit confirmation of inflight message risk.\n${INFLIGHT_MESSAGE_QUEUE_WARNING}\nPlease re-invoke with confirmInflightRisk: true.`,
              },
            ],
            isError: true,
          };
        }

        const ns = args.namespace ? args.namespace.toUpperCase() : this._config.namespace;
        const api = new AtelierAPI(this._config.serverName);
        const mode = args.mode || "restartHost";

        let result: ProductionOperationResult;
        if (mode === "updateProduction") {
          result = await updateProduction(api, ns);
        } else if (mode === "toggle") {
          result = await toggleConfigItem(api, ns, itemName);
        } else {
          result = await restartProductionHost(api, ns, itemName);
        }

        return {
          content: [{ type: "text", text: result.message }],
          isError: !result.success,
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  }

  private async _readResource(uri: string): Promise<{ uri: string; mimeType: string; text: string }> {
    if (uri === "iris://config") {
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(
          {
            activeServer: this._config.serverName,
            activeNamespace: this._config.namespace,
            compileFlags: this._config.compileFlags,
            sourceRoot: this._config.sourceRoot,
            mappings: this._config.mappings,
            servers: Object.keys(this._config.servers),
          },
          null,
          2
        ),
      };
    }

    if (uri.startsWith("iris://schema/")) {
      const className = uri.slice("iris://schema/".length);
      const api = new AtelierAPI(Uri.file(process.cwd()));
      api.setNamespace(this._config.namespace);
      const doc = await api.getDoc(`${className}.cls`, Uri.file(process.cwd()));
      return {
        uri,
        mimeType: "text/plain",
        text: doc.result?.content ? (Array.isArray(doc.result.content) ? doc.result.content.join("\n") : String(doc.result.content)) : `Class ${className} not found`,
      };
    }

    throw new Error(`Resource not found: ${uri}`);
  }

  private _sendResult(id: number | string, result: any): void {
    this._sendResponse(id, undefined, result);
  }

  private _sendError(id: number | string, code: number, message: string): void {
    this._sendResponse(id, { code, message });
  }

  private _sendResponse(id: number | string | null, error?: { code: number; message: string }, result?: any): void {
    const payload: Record<string, any> = {
      jsonrpc: "2.0",
      id,
    };
    if (error) {
      payload.error = error;
    } else {
      payload.result = result;
    }
    const json = JSON.stringify(payload);
    process.stdout.write(`Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`);
  }
}
