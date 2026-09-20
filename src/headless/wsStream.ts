/**
 * src/headless/wsStream.ts
 *
 * Real-Time Bidirectional WebSocket Streaming Client for iris-sync (Milestone M2.2).
 * Connects to the InterSystems IRIS Atelier WebSocket endpoint to stream
 * compiler console lines directly to stdout with sub-millisecond latency.
 */

import WebSocket from "ws";
import { ResolvedConfig } from "./configBridge";
import { logger } from "./terminalLogger";

export interface WsStreamOptions {
  onLine?: (line: string) => void;
  timeoutMs?: number;
}

export interface WsCompileResult {
  success: boolean;
  output: string[];
  durationMs: number;
}

export class AtelierWebSocketStreamer {
  private _socket: WebSocket | null = null;
  private _config: ResolvedConfig;
  private _url: string;
  private _connected = false;
  private _ready = false;
  private _readyResolver?: () => void;
  private _readyRejecter?: (err: Error) => void;

  private _cookies?: string;

  constructor(config: ResolvedConfig, cookies?: string) {
    this._config = config;
    this._cookies = cookies;
    const proto = config.serverSpec.webServer.scheme === "https" ? "wss" : "ws";
    const host = config.serverSpec.webServer.host;
    const port = config.serverSpec.webServer.port;
    const pathPrefix = config.serverSpec.webServer.pathPrefix || "";
    const apiVersion = config.serverSpec.apiVersion || 8;

    this._url = `${proto}://${host}:${port}${pathPrefix}/api/atelier/v${apiVersion}/%25SYS/terminal`;
  }

  /**
   * Connects to the Atelier WebSocket endpoint and awaits initial prompt readiness.
   */
  public async connect(timeoutMs = 5000): Promise<void> {
    const user = this._config.serverSpec.username || "_SYSTEM";
    const pass = this._config.serverSpec.password || "";
    const authHeader = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");

    // If cookies were not provided, obtain a session cookie from Atelier API first
    let cookieHeader = this._cookies || "";
    if (!cookieHeader) {
      try {
        const httpMod = this._config.serverSpec.webServer.scheme === "https" ? await import("https") : await import("http");
        const pathPrefix = this._config.serverSpec.webServer.pathPrefix || "";
        cookieHeader = await new Promise<string>((res) => {
          const req = httpMod.request(
            {
              host: this._config.serverSpec.webServer.host,
              port: this._config.serverSpec.webServer.port,
              path: `${pathPrefix}/api/atelier/`,
              method: "GET",
              rejectUnauthorized: !this._config.insecure,
              headers: { Authorization: authHeader },
            },
            (response) => {
              const setCookies = response.headers["set-cookie"];
              if (setCookies && Array.isArray(setCookies)) {
                res(setCookies.map((c) => c.split(";")[0]).join("; "));
              } else {
                res("");
              }
            }
          );
          req.on("error", () => res(""));
          req.setTimeout(timeoutMs, () => {
            req.destroy();
            res("");
          });
          req.end();
        });
      } catch (_) {}
    }

    return new Promise<void>((resolve, reject) => {
      this._readyResolver = resolve;
      this._readyRejecter = reject;

      const timer = setTimeout(() => {
        if (!this._ready) {
          this.close();
          reject(new Error(`WebSocket connection to ${this._url} timed out after ${timeoutMs}ms.`));
        }
      }, timeoutMs);

      try {
        const headers: Record<string, string> = {
          Authorization: authHeader,
        };
        if (cookieHeader) {
          headers["cookie"] = cookieHeader;
        }

        this._socket = new WebSocket(this._url, {
          rejectUnauthorized: !this._config.insecure,
          headers,
        });

        this._socket.on("open", () => {
          this._connected = true;
        });

        this._socket.on("message", (data: WebSocket.Data) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === "init") {
              // Send configuration to establish target namespace
              this._socket?.send(
                JSON.stringify({
                  type: "config",
                  namespace: this._config.namespace,
                  rawMode: true,
                })
              );
            } else if (msg.type === "prompt") {
              if (!this._ready) {
                this._ready = true;
                clearTimeout(timer);
                if (this._readyResolver) this._readyResolver();
              }
            } else if (msg.type === "error") {
              clearTimeout(timer);
              reject(new Error(msg.text || "Atelier WebSocket server error"));
            }
          } catch (_) {}
        });

        this._socket.on("error", (err) => {
          clearTimeout(timer);
          if (!this._ready && this._readyRejecter) {
            this._readyRejecter(err);
          }
        });

        this._socket.on("close", () => {
          this._connected = false;
          this._ready = false;
        });
      } catch (err: any) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  /**
   * Compiles one or more documents, streaming output lines in real-time.
   */
  public async compileStream(
    docNames: string | string[],
    flags = "cuk",
    options: WsStreamOptions = {}
  ): Promise<WsCompileResult> {
    if (!this._socket || !this._ready) {
      await this.connect(options.timeoutMs);
    }

    const docs = Array.isArray(docNames) ? docNames : [docNames];
    const output: string[] = [];
    let hasError = false;
    const startTime = Date.now();

    // Format ObjectScript compile invocation using $system.OBJ.CompileList
    const items = docs.join(",");
    const command = `do $system.OBJ.CompileList("${items}", "${flags}")`;

    return new Promise<WsCompileResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        resolve({
          success: !hasError,
          output,
          durationMs: Date.now() - startTime,
        });
      }, options.timeoutMs || 30000);

      const messageHandler = (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "output") {
            const rawText: string = msg.text || "";
            const lines = rawText.split(/\r?\n/);
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed) {
                output.push(trimmed);
                if (trimmed.includes("ERROR #") || trimmed.includes("Detected") && trimmed.includes("errors")) {
                  hasError = true;
                }
                if (options.onLine) {
                  options.onLine(trimmed);
                } else {
                  console.log(`[WS-STREAM] ${trimmed}`);
                }
              }
            }
          } else if (msg.type === "prompt") {
            // Execution of command completed and returned to prompt
            cleanup();
            resolve({
              success: !hasError,
              output,
              durationMs: Date.now() - startTime,
            });
          }
        } catch (_) {}
      };

      const errorHandler = (err: Error) => {
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this._socket?.off("message", messageHandler);
        this._socket?.off("error", errorHandler);
      };

      this._socket?.on("message", messageHandler);
      this._socket?.on("error", errorHandler);

      // Trigger compilation command
      this._socket?.send(
        JSON.stringify({
          type: "prompt",
          input: command,
        })
      );
    });
  }

  /**
   * Safely closes the WebSocket connection.
   */
  public close(): void {
    if (this._socket) {
      try {
        this._socket.close();
      } catch (_) {}
      this._socket = null;
    }
    this._connected = false;
    this._ready = false;
  }
}
