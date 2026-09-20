/**
 * src/headless/diagnostics.ts
 *
 * Structured Diagnostic Reporting Engine for iris-sync (Milestone M3.2).
 * Formats compilation syntax errors and compiler messages into machine-readable
 * JSON and OASIS SARIF v2.1.0 formats for autonomous AI agent automated repair loops.
 */

import * as fs from "fs";
import * as path from "path";
import { getIrisSyncVersions } from "./version";

export interface StructuredDiagnostic {
  file: string;
  document: string;
  line: number;
  column: number;
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  raw?: string;
}

export interface DiagnosticSummary {
  totalFiles: number;
  compiled: number;
  errors: number;
  warnings: number;
  durationMs: number;
}

export interface JsonDiagnosticReport {
  version: "1.0.0";
  success: boolean;
  summary: DiagnosticSummary;
  diagnostics: StructuredDiagnostic[];
}

export interface SarifResult {
  ruleId: string;
  level: "error" | "warning" | "note";
  message: { text: string };
  locations: {
    physicalLocation: {
      artifactLocation: { uri: string };
      region?: {
        startLine: number;
        startColumn?: number;
      };
    };
  }[];
}

export interface SarifReport {
  $schema: string;
  version: "2.1.0";
  runs: {
    tool: {
      driver: {
        name: string;
        version: string;
        informationUri: string;
      };
    };
    results: SarifResult[];
  }[];
}

/**
 * Parses raw Atelier API error objects and console error lines into StructuredDiagnostics.
 */
export function parseCompilerDiagnostics(
  rawErrors: any[],
  docName: string,
  filePath: string
): StructuredDiagnostic[] {
  const diagnostics: StructuredDiagnostic[] = [];

  for (const err of rawErrors) {
    if (typeof err === "object" && err !== null) {
      const line = Number(err.line) || 1;
      const column = Number(err.offset) || 1;
      const code = err.code ? `ERROR #${err.code}` : "ERROR";
      const message = err.text || err.message || JSON.stringify(err);

      diagnostics.push({
        file: filePath,
        document: docName,
        line,
        column,
        severity: "error",
        code,
        message: cleanErrorMessage(message),
        raw: typeof err === "string" ? err : JSON.stringify(err),
      });
    } else if (typeof err === "string") {
      const parsed = parseErrorLine(err, docName, filePath);
      if (parsed) {
        diagnostics.push(parsed);
      } else {
        diagnostics.push({
          file: filePath,
          document: docName,
          line: 1,
          column: 1,
          severity: "error",
          code: "ERROR",
          message: cleanErrorMessage(err),
          raw: err,
        });
      }
    }
  }

  return diagnostics;
}

/**
 * Parses a single error string, extracting line, offset, and error code if available.
 * Example IRIS output: "ERROR #5462: Syntax error at line 15 offset 5: [ unexpected token ]"
 */
export function parseErrorLine(
  line: string,
  docName: string,
  filePath: string
): StructuredDiagnostic | null {
  const codeMatch = line.match(/(ERROR\s*#\d+|WARNING\s*#\d+)/i);
  const code = codeMatch ? codeMatch[1].toUpperCase() : "ERROR";
  const severity: "error" | "warning" = code.startsWith("WARN") ? "warning" : "error";

  let lineNum = 1;
  let colNum = 1;

  // Search for line/offset patterns
  const lineMatch = line.match(/line\s+(\d+)/i);
  if (lineMatch) {
    lineNum = parseInt(lineMatch[1], 10);
  }

  const offsetMatch = line.match(/offset\s+(\d+)/i);
  if (offsetMatch) {
    colNum = parseInt(offsetMatch[1], 10);
  }

  return {
    file: filePath,
    document: docName,
    line: lineNum,
    column: colNum,
    severity,
    code,
    message: cleanErrorMessage(line),
    raw: line,
  };
}

function cleanErrorMessage(msg: string): string {
  return msg.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Generates a JSON diagnostic report object.
 */
export function formatJsonReport(
  diagnostics: StructuredDiagnostic[],
  summary: DiagnosticSummary
): JsonDiagnosticReport {
  return {
    version: "1.0.0",
    success: diagnostics.filter((d) => d.severity === "error").length === 0,
    summary,
    diagnostics,
  };
}

/**
 * Generates an OASIS SARIF v2.1.0 compliant report.
 */
export function formatSarifReport(
  diagnostics: StructuredDiagnostic[]
): SarifReport {
  const { compositeVersion } = getIrisSyncVersions();

  const results: SarifResult[] = diagnostics.map((d) => {
    const level: "error" | "warning" | "note" =
      d.severity === "error" ? "error" : d.severity === "warning" ? "warning" : "note";

    // Normalize relative URI for SARIF artifactLocation
    const relUri = path.relative(process.cwd(), d.file).replace(/\\/g, "/");

    return {
      ruleId: d.code,
      level,
      message: { text: d.message },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: relUri },
            region: {
              startLine: d.line > 0 ? d.line : 1,
              startColumn: d.column > 0 ? d.column : 1,
            },
          },
        },
      ],
    };
  });

  return {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "iris-sync",
            version: compositeVersion,
            informationUri: "https://github.com/G3Labz/vscode-objectscript",
          },
        },
        results,
      },
    ],
  };
}

/**
 * DiagnosticCollector aggregates diagnostics, track timings, and emits structured reports.
 */
export class DiagnosticCollector {
  private diagnostics: StructuredDiagnostic[] = [];
  private totalFiles: number = 0;
  private compiled: number = 0;
  private startTime: number = Date.now();

  public setTotalFiles(count: number): void {
    this.totalFiles = count;
  }

  public recordSuccess(count: number = 1): void {
    this.compiled += count;
  }

  public addDiagnostic(diag: StructuredDiagnostic): void {
    this.diagnostics.push(diag);
  }

  public addDiagnostics(diags: StructuredDiagnostic[]): void {
    this.diagnostics.push(...diags);
  }

  public addRawErrors(rawErrors: any[], docName: string, filePath: string): void {
    const parsed = parseCompilerDiagnostics(rawErrors, docName, filePath);
    this.diagnostics.push(...parsed);
  }

  public addConsoleLine(line: string, docName: string, filePath: string): void {
    const parsed = parseErrorLine(line, docName, filePath);
    if (parsed) {
      this.diagnostics.push(parsed);
    }
  }

  public hasErrors(): boolean {
    return this.diagnostics.some((d) => d.severity === "error");
  }

  public getDiagnostics(): StructuredDiagnostic[] {
    return [...this.diagnostics];
  }

  public getSummary(): DiagnosticSummary {
    const errors = this.diagnostics.filter((d) => d.severity === "error").length;
    const warnings = this.diagnostics.filter((d) => d.severity === "warning").length;
    return {
      totalFiles: this.totalFiles,
      compiled: this.compiled,
      errors,
      warnings,
      durationMs: Date.now() - this.startTime,
    };
  }

  public toJsonReport(): JsonDiagnosticReport {
    return formatJsonReport(this.diagnostics, this.getSummary());
  }

  public toSarifReport(): SarifReport {
    return formatSarifReport(this.diagnostics);
  }

  public emit(format: string, outputFile?: string): void {
    const normFormat = (format || "console").toLowerCase();
    if (normFormat === "console" && !outputFile) {
      return;
    }

    let content = "";
    if (normFormat === "sarif") {
      content = JSON.stringify(this.toSarifReport(), null, 2);
    } else if (normFormat === "json") {
      content = JSON.stringify(this.toJsonReport(), null, 2);
    } else {
      return;
    }

    if (outputFile) {
      const outAbs = path.resolve(outputFile);
      const outDir = path.dirname(outAbs);
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }
      fs.writeFileSync(outAbs, content, "utf8");
    } else {
      process.stdout.write(content + "\n");
    }
  }
}

