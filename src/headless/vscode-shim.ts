/**
 * src/headless/vscode-shim.ts
 * Virtual Runtime Shim providing headless implementations of the VS Code API.
 * Used during build:cli via esbuild module aliasing (--alias:vscode=...).
 *
 * Implements Pattern A (Virtual Runtime Shim) as specified in Section 4 and Section 6
 * of the Headless IRIS Sync & Compiler Guide.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { EventEmitter as NodeEventEmitter } from "events";
import { URI, Utils as UriUtils } from "vscode-uri";
import { HeadlessMemento } from "./headlessState";
import { TerminalOutputChannel } from "./terminalLogger";

// ---------------------------------------------------------------------------
// 1. Uri Re-export & Augmentation
// ---------------------------------------------------------------------------

export const Uri = Object.assign(URI, {
  joinPath: (base: URI, ...pathSegments: string[]): URI => {
    return UriUtils.joinPath(base, ...pathSegments);
  },
});
export type Uri = URI;

// ---------------------------------------------------------------------------
// 2. Lifecycle & Events (Disposable, EventEmitter, Cancellation)
// ---------------------------------------------------------------------------

export class Disposable {
  constructor(private callOnDispose: () => any = () => {}) {}
  public dispose(): void {
    if (this.callOnDispose) {
      this.callOnDispose();
    }
  }
  public static from(...disposables: { dispose(): any }[]): Disposable {
    return new Disposable(() => {
      disposables.forEach((d) => d && typeof d.dispose === "function" && d.dispose());
    });
  }
}

export class EventEmitter<T = any> {
  private emitter = new NodeEventEmitter();
  public event = (listener: (e: T) => any): Disposable => {
    this.emitter.on("event", listener);
    return new Disposable(() => this.emitter.off("event", listener));
  };
  public fire(data: T): void {
    this.emitter.emit("event", data);
  }
  public dispose(): void {
    this.emitter.removeAllListeners();
  }
}

export class CancellationToken {
  public readonly isCancellationRequested: boolean = false;
  public readonly onCancellationRequested: (listener: (e: any) => any) => Disposable = () => new Disposable();
}

export class CancellationTokenSource {
  private _isCancelled = false;
  private _emitter = new EventEmitter<void>();

  public get token(): CancellationToken {
    return {
      isCancellationRequested: this._isCancelled,
      onCancellationRequested: this._emitter.event,
    };
  }

  public cancel(): void {
    if (!this._isCancelled) {
      this._isCancelled = true;
      this._emitter.fire();
    }
  }

  public dispose(): void {
    this._emitter.dispose();
  }
}

// ---------------------------------------------------------------------------
// 3. Enums & Constants
// ---------------------------------------------------------------------------

export enum EndOfLine {
  LF = 1,
  CRLF = 2,
}

export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64,
}

export enum ExtensionKind {
  UI = 1,
  Workspace = 2,
}

export enum ExtensionMode {
  Production = 1,
  Development = 2,
  Test = 3,
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export enum ProgressLocation {
  SourceControl = 1,
  Window = 10,
  Notification = 15,
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export enum DiagnosticTag {
  Unnecessary = 1,
  Deprecated = 2,
}

export enum FileChangeType {
  Created = 1,
  Changed = 2,
  Deleted = 3,
}

export enum CompletionItemKind {
  Text = 0,
  Method = 1,
  Function = 2,
  Constructor = 3,
  Field = 4,
  Variable = 5,
  Class = 6,
  Interface = 7,
  Module = 8,
  Property = 9,
  Unit = 10,
  Value = 11,
  Enum = 12,
  Keyword = 13,
  Snippet = 14,
  Color = 15,
  File = 16,
  Reference = 17,
  Folder = 18,
  EnumMember = 19,
  Constant = 20,
  Struct = 21,
  Event = 22,
  Operator = 23,
  TypeParameter = 24,
}

export enum CompletionTriggerKind {
  Invoke = 0,
  TriggerCharacter = 1,
  TriggerForIncompleteCompletions = 2,
}

export enum SymbolKind {
  File = 0,
  Module = 1,
  Namespace = 2,
  Package = 3,
  Class = 4,
  Method = 5,
  Property = 6,
  Field = 7,
  Constructor = 8,
  Enum = 9,
  Interface = 10,
  Function = 11,
  Variable = 12,
  Constant = 13,
  String = 14,
  Number = 15,
  Boolean = 16,
  Array = 17,
  Object = 18,
  Key = 19,
  Null = 20,
  EnumMember = 21,
  Struct = 22,
  Event = 23,
  Operator = 24,
  TypeParameter = 25,
}

export enum FoldingRangeKind {
  Comment = 1,
  Imports = 2,
  Region = 3,
}

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
  Three = 3,
  Four = 4,
  Five = 5,
  Six = 6,
  Seven = 7,
  Eight = 8,
  Nine = 9,
}

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}

export enum TextEditorRevealType {
  Default = 0,
  InCenter = 1,
  InCenterIfOutsideViewport = 2,
  AtTop = 3,
}

export enum QuickPickItemKind {
  Separator = -1,
  Default = 0,
}

export enum TestRunProfileKind {
  Run = 1,
  Debug = 2,
  Coverage = 3,
}

// ---------------------------------------------------------------------------
// 4. Text & Document Types (Position, Range, Location, Selection, etc.)
// ---------------------------------------------------------------------------

export class Position {
  constructor(public readonly line: number, public readonly character: number) {}

  public isAfter(other: Position): boolean {
    return this.line > other.line || (this.line === other.line && this.character > other.character);
  }
  public isBefore(other: Position): boolean {
    return this.line < other.line || (this.line === other.line && this.character < other.character);
  }
  public isEqual(other: Position): boolean {
    return this.line === other.line && this.character === other.character;
  }
  public translate(lineDelta: number = 0, characterDelta: number = 0): Position {
    return new Position(this.line + lineDelta, this.character + characterDelta);
  }
  public with(line?: number, character?: number): Position {
    return new Position(line !== undefined ? line : this.line, character !== undefined ? character : this.character);
  }
}

export class Range {
  public readonly start: Position;
  public readonly end: Position;

  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number);
  constructor(start: Position, end: Position);
  constructor(p1: number | Position, p2: number | Position, p3?: number, p4?: number) {
    if (typeof p1 === "number") {
      this.start = new Position(p1, p2 as number);
      this.end = new Position(p3 as number, p4 as number);
    } else {
      this.start = p1;
      this.end = p2 as Position;
    }
  }

  public contains(_positionOrRange: Position | Range): boolean {
    return true;
  }
  public isEqual(other: Range): boolean {
    return this.start.isEqual(other.start) && this.end.isEqual(other.end);
  }
  public with(start?: Position, end?: Position): Range {
    return new Range(start || this.start, end || this.end);
  }
}

export class Location {
  constructor(public readonly uri: URI, public readonly range: Range | Position) {}
}

export class Selection extends Range {
  public readonly anchor: Position;
  public readonly active: Position;

  constructor(anchor: Position, active: Position);
  constructor(anchorLine: number, anchorCharacter: number, activeLine: number, activeCharacter: number);
  constructor(p1: number | Position, p2: number | Position, p3?: number, p4?: number) {
    super(p1 as any, p2 as any, p3 as any, p4 as any);
    this.anchor = typeof p1 === "number" ? new Position(p1, p2 as number) : p1;
    this.active = typeof p1 === "number" ? new Position(p3 as number, p4 as number) : (p2 as Position);
  }
}

export class ThemeColor {
  constructor(public readonly id: string) {}
}

export class ThemeIcon {
  constructor(public readonly id: string, public readonly color?: ThemeColor) {}
}

export class TreeItem {
  constructor(public label?: string, public collapsibleState?: TreeItemCollapsibleState) {}
}

export class SnippetString {
  constructor(public value: string = "") {}
  public appendText(string: string): SnippetString {
    this.value += string;
    return this;
  }
}

export class SnippetTextEdit {
  constructor(public range: Range, public snippet: SnippetString) {}
}

export class MarkdownString {
  constructor(public value: string = "", public isTrusted: boolean = false) {}
  public appendMarkdown(value: string): MarkdownString {
    this.value += value;
    return this;
  }
}

export class DiagnosticRelatedInformation {
  constructor(public location: Location, public message: string) {}
}

export class Diagnostic {
  public code?: string | number;
  public source?: string;
  public relatedInformation?: DiagnosticRelatedInformation[];
  public tags?: DiagnosticTag[];

  constructor(public range: Range, public message: string, public severity: DiagnosticSeverity = DiagnosticSeverity.Error) {}
}

export class CodeActionKind {
  public static readonly Empty = new CodeActionKind("");
  public static readonly QuickFix = new CodeActionKind("quickfix");
  public static readonly Refactor = new CodeActionKind("refactor");
  public static readonly RefactorExtract = new CodeActionKind("refactor.extract");
  public static readonly RefactorInline = new CodeActionKind("refactor.inline");
  public static readonly RefactorMove = new CodeActionKind("refactor.move");
  public static readonly RefactorRewrite = new CodeActionKind("refactor.rewrite");
  public static readonly Source = new CodeActionKind("source");
  public static readonly SourceOrganizeImports = new CodeActionKind("source.organizeImports");
  public static readonly SourceFixAll = new CodeActionKind("source.fixAll");

  constructor(public readonly value: string) {}
}

export class CodeAction {
  public edit?: WorkspaceEdit;
  public diagnostics?: Diagnostic[];
  public command?: any;
  public isPreferred?: boolean;

  constructor(public title: string, public kind?: CodeActionKind) {}
}

export class CodeLens {
  constructor(public range: Range, public command?: any) {}
}

export class CompletionItem {
  public detail?: string;
  public documentation?: string | MarkdownString;
  public insertText?: string | SnippetString;
  public sortText?: string;
  public filterText?: string;

  constructor(public label: string, public kind?: CompletionItemKind) {}
}

export class CompletionList {
  constructor(public items: CompletionItem[] = [], public isIncomplete: boolean = false) {}
}

export class DocumentSymbol {
  public children: DocumentSymbol[] = [];
  constructor(
    public name: string,
    public detail: string,
    public kind: SymbolKind,
    public range: Range,
    public selectionRange: Range
  ) {}
}

export class SymbolInformation {
  public containerName?: string;
  constructor(
    public name: string,
    public kind: SymbolKind,
    public containerNameOrRange: string | Range,
    public locationOrUri?: Location | URI,
    public container?: string
  ) {}
}

export class DocumentLink {
  constructor(public range: Range, public target?: URI) {}
}

export class FoldingRange {
  constructor(public start: number, public end: number, public kind?: FoldingRangeKind) {}
}

export class RelativePattern {
  constructor(public base: string | URI, public pattern: string) {}
}

export class TextEdit {
  constructor(public range: Range, public newText: string) {}
  public static replace(range: Range, newText: string): TextEdit {
    return new TextEdit(range, newText);
  }
  public static insert(position: Position, newText: string): TextEdit {
    return new TextEdit(new Range(position, position), newText);
  }
  public static delete(range: Range): TextEdit {
    return new TextEdit(range, "");
  }
}

export class WorkspaceEdit {
  private _edits: { uri: URI; edits: TextEdit[] }[] = [];
  public replace(uri: URI, range: Range, newText: string): void {
    this._edits.push({ uri, edits: [new TextEdit(range, newText)] });
  }
  public insert(uri: URI, position: Position, newText: string): void {
    this._edits.push({ uri, edits: [TextEdit.insert(position, newText)] });
  }
  public delete(uri: URI, range: Range): void {
    this._edits.push({ uri, edits: [TextEdit.delete(range)] });
  }
  public has(_uri: URI): boolean {
    return this._edits.some((e) => e.uri.toString() === _uri.toString());
  }
  public set(uri: URI, edits: TextEdit[]): void {
    this._edits.push({ uri, edits });
  }
  public entries(): [URI, TextEdit[]][] {
    return this._edits.map((e) => [e.uri, e.edits]);
  }
}

export class TerminalProfile {
  constructor(public options: any) {}
}

// ---------------------------------------------------------------------------
// 5. FileSystemError
// ---------------------------------------------------------------------------

export class FileSystemError extends Error {
  public code: string;

  constructor(messageOrUri?: string | URI) {
    const msg = typeof messageOrUri === "string" ? messageOrUri : messageOrUri?.fsPath || "FileSystemError";
    super(msg);
    this.name = "FileSystemError";
    this.code = "Generic";
  }

  public static FileNotFound(messageOrUri?: any): FileSystemError {
    const err = new FileSystemError(messageOrUri);
    err.code = "FileNotFound";
    return err;
  }

  public static FileExists(messageOrUri?: any): FileSystemError {
    const err = new FileSystemError(messageOrUri);
    err.code = "FileExists";
    return err;
  }

  public static FileNotADirectory(messageOrUri?: any): FileSystemError {
    const err = new FileSystemError(messageOrUri);
    err.code = "FileNotADirectory";
    return err;
  }

  public static FileIsADirectory(messageOrUri?: any): FileSystemError {
    const err = new FileSystemError(messageOrUri);
    err.code = "FileIsADirectory";
    return err;
  }

  public static NoPermissions(messageOrUri?: any): FileSystemError {
    const err = new FileSystemError(messageOrUri);
    err.code = "NoPermissions";
    return err;
  }

  public static Unavailable(messageOrUri?: any): FileSystemError {
    const err = new FileSystemError(messageOrUri);
    err.code = "Unavailable";
    return err;
  }
}

// ---------------------------------------------------------------------------
// 6. Runtime Configuration Engine
// ---------------------------------------------------------------------------

export const activeRuntimeConfig: Record<string, any> = {};

export class HeadlessConfiguration {
  constructor(private section?: string, private configData: Record<string, any> = activeRuntimeConfig) {}

  public get<T>(key?: string, defaultValue?: T): T {
    if (!key) {
      return this.getAll() as T;
    }
    const fullKey = this.section ? `${this.section}.${key}` : key;
    if (fullKey in this.configData && this.configData[fullKey] !== undefined) {
      return this.configData[fullKey];
    }
    const parts = fullKey.split(".");
    let curr: any = this.configData;
    for (const part of parts) {
      if (curr === undefined || curr === null) break;
      curr = curr[part];
    }
    if (curr !== undefined) return curr as T;

    if (this.section && this.section in this.configData) {
      let sub = this.configData[this.section];
      if (typeof sub === "object" && sub !== null) {
        if (key in sub) return sub[key];
        const lowerKey = key.toLowerCase();
        for (const k of Object.keys(sub)) {
          if (k.toLowerCase() === lowerKey) return sub[k];
        }
      }
    }

    return defaultValue as T;
  }

  public has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  public async update(key: string, value: any): Promise<void> {
    const fullKey = this.section ? `${this.section}.${key}` : key;
    this.configData[fullKey] = value;
  }

  public inspect<T>(section: string): { key: string; defaultValue?: T; globalValue?: T; workspaceValue?: T; workspaceFolderValue?: T } | undefined {
    const val = this.get<T>(section);
    return val !== undefined ? { key: section, workspaceValue: val } : undefined;
  }

  private getAll(): Record<string, any> {
    if (!this.section) return { ...this.configData };
    return this.configData[this.section] ?? {};
  }
}

// ---------------------------------------------------------------------------
// 7. Workspace Subsystem (vscode.workspace)
// ---------------------------------------------------------------------------

export class HeadlessTextDocument {
  private _lines: string[];
  public readonly uri: URI;
  public readonly fileName: string;
  public readonly isDirty: boolean = false;
  public readonly isClosed: boolean = false;
  public readonly version: number = 1;
  public readonly languageId: string;
  public readonly eol: EndOfLine;

  constructor(uri: URI, private _content: string) {
    this.uri = uri;
    this.fileName = uri.fsPath;
    this._lines = _content.split(/\r?\n/);
    this.eol = _content.includes("\r\n") ? EndOfLine.CRLF : EndOfLine.LF;
    const ext = path.extname(uri.fsPath).toLowerCase();
    this.languageId = ext === ".cls" ? "objectscript-class" : "objectscript";
  }

  public get lineCount(): number {
    return this._lines.length;
  }

  public getText(range?: Range): string {
    if (!range) return this._content;
    const startLine = Math.max(0, Math.min(range.start.line, this._lines.length - 1));
    const endLine = Math.max(0, Math.min(range.end.line, this._lines.length - 1));
    if (startLine === endLine) {
      return (this._lines[startLine] || "").substring(range.start.character, range.end.character);
    }
    const result: string[] = [];
    result.push((this._lines[startLine] || "").substring(range.start.character));
    for (let i = startLine + 1; i < endLine; i++) {
      result.push(this._lines[i] || "");
    }
    result.push((this._lines[endLine] || "").substring(0, range.end.character));
    return result.join(this.eol === EndOfLine.CRLF ? "\r\n" : "\n");
  }

  public lineAt(lineOrPosition: number | Position): {
    lineNumber: number;
    text: string;
    range: Range;
    rangeIncludingLineBreak: Range;
    firstNonWhitespaceCharacterIndex: number;
    isEmptyOrWhitespace: boolean;
  } {
    const lineNum = typeof lineOrPosition === "number" ? lineOrPosition : lineOrPosition.line;
    const text = this._lines[lineNum] ?? "";
    const range = new Range(lineNum, 0, lineNum, text.length);
    const rangeIncludingLineBreak = new Range(lineNum, 0, lineNum + 1, 0);
    const match = text.match(/\S/);
    const firstNonWhitespaceCharacterIndex = match ? match.index! : text.length;
    return {
      lineNumber: lineNum,
      text,
      range,
      rangeIncludingLineBreak,
      firstNonWhitespaceCharacterIndex,
      isEmptyOrWhitespace: text.trim().length === 0,
    };
  }

  public positionAt(offset: number): Position {
    let curr = 0;
    for (let i = 0; i < this._lines.length; i++) {
      const lineLen = this._lines[i].length + (this.eol === EndOfLine.CRLF ? 2 : 1);
      if (curr + lineLen > offset) {
        return new Position(i, Math.max(0, offset - curr));
      }
      curr += lineLen;
    }
    return new Position(Math.max(0, this._lines.length - 1), (this._lines[this._lines.length - 1] || "").length);
  }

  public offsetAt(position: Position): number {
    let offset = 0;
    const targetLine = Math.min(position.line, this._lines.length - 1);
    for (let i = 0; i < targetLine; i++) {
      offset += this._lines[i].length + (this.eol === EndOfLine.CRLF ? 2 : 1);
    }
    offset += Math.min(position.character, (this._lines[targetLine] || "").length);
    return offset;
  }
}

let _cwd = process.cwd();
export function setHeadlessCwd(dir: string): void {
  _cwd = path.resolve(dir);
}

export const workspace = {
  get workspaceFolders() {
    return [
      {
        uri: Uri.file(_cwd),
        name: path.basename(_cwd),
        index: 0,
      },
    ];
  },

  get workspaceFile() {
    return undefined;
  },

  get textDocuments() {
    return [];
  },

  getWorkspaceFolder(uriOrPath: any) {
    const currentWf = {
      uri: Uri.file(_cwd),
      name: path.basename(_cwd),
      index: 0,
    };
    if (!uriOrPath) return currentWf;
    const fsPath = uriOrPath?.fsPath ?? (typeof uriOrPath === "string" ? uriOrPath : "");
    if (!fsPath) return currentWf;
    if (fsPath.startsWith(_cwd)) return currentWf;
    return currentWf;
  },

  getConfiguration(section?: string, _scope?: any) {
    return new HeadlessConfiguration(section, activeRuntimeConfig);
  },

  asRelativePath(pathOrUri: string | URI, _includeWorkspaceFolder?: boolean): string {
    const fsPath = typeof pathOrUri === "string" ? pathOrUri : pathOrUri.fsPath;
    return path.relative(_cwd, fsPath);
  },

  updateWorkspaceFolders(_start: number, _deleteCount: number, ..._workspaceFoldersToAdd: any[]): boolean {
    return true;
  },

  async openTextDocument(uriOrFileName: any): Promise<any> {
    if (uriOrFileName instanceof HeadlessTextDocument) {
      return uriOrFileName;
    }
    const filePath = typeof uriOrFileName === "string" ? uriOrFileName : uriOrFileName.fsPath;
    const uri = typeof uriOrFileName === "string" ? Uri.file(filePath) : uriOrFileName;
    let content = "";
    try {
      content = await fs.readFile(filePath, "utf8");
    } catch (_) {}
    return new HeadlessTextDocument(uri, content);
  },

  fs: {
    async readFile(uri: URI): Promise<Uint8Array> {
      try {
        return await fs.readFile(uri.fsPath);
      } catch (e: any) {
        if (e.code === "ENOENT") throw FileSystemError.FileNotFound(uri);
        throw new FileSystemError(e.message);
      }
    },
    async writeFile(uri: URI, content: Uint8Array): Promise<void> {
      await fs.mkdir(path.dirname(uri.fsPath), { recursive: true });
      await fs.writeFile(uri.fsPath, content);
    },
    async stat(uri: URI): Promise<{ type: FileType; ctime: number; mtime: number; size: number }> {
      try {
        const stats = await fs.stat(uri.fsPath);
        return {
          type: stats.isDirectory()
            ? FileType.Directory
            : stats.isFile()
            ? FileType.File
            : stats.isSymbolicLink()
            ? FileType.SymbolicLink
            : FileType.Unknown,
          ctime: stats.ctimeMs,
          mtime: stats.mtimeMs,
          size: stats.size,
        };
      } catch (e: any) {
        if (e.code === "ENOENT") throw FileSystemError.FileNotFound(uri);
        throw new FileSystemError(e.message);
      }
    },
    async delete(uri: URI, options?: { recursive?: boolean; useTrash?: boolean }): Promise<void> {
      try {
        await fs.rm(uri.fsPath, { recursive: options?.recursive ?? false, force: true });
      } catch (e: any) {
        if (e.code === "ENOENT") throw FileSystemError.FileNotFound(uri);
        throw new FileSystemError(e.message);
      }
    },
    async createDirectory(uri: URI): Promise<void> {
      await fs.mkdir(uri.fsPath, { recursive: true });
    },
    async readDirectory(uri: URI): Promise<[string, FileType][]> {
      try {
        const entries = await fs.readdir(uri.fsPath, { withFileTypes: true });
        return entries.map((e) => [
          e.name,
          e.isDirectory() ? FileType.Directory : e.isFile() ? FileType.File : FileType.Unknown,
        ]);
      } catch (e: any) {
        if (e.code === "ENOENT") throw FileSystemError.FileNotFound(uri);
        throw new FileSystemError(e.message);
      }
    },
    isWritableFileSystem(scheme: string): boolean {
      return scheme === "file";
    },
  },

  createFileSystemWatcher(_globPattern: any) {
    return {
      onDidCreate: () => new Disposable(),
      onDidChange: () => new Disposable(),
      onDidDelete: () => new Disposable(),
      dispose: () => {},
    };
  },

  findFiles: async (include: any, _exclude?: any, maxResults?: number): Promise<URI[]> => {
    let searchDir = _cwd;
    if (include && typeof include === "object" && "base" in include) {
      const baseUri = typeof include.base === "string" ? Uri.file(include.base) : include.base;
      searchDir = baseUri.fsPath;
    }
    try {
      const walk = async (dir: string): Promise<string[]> => {
        let results: string[] = [];
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              if (entry.name !== ".git" && entry.name !== "node_modules" && entry.name !== ".vscode-test") {
                results = results.concat(await walk(fullPath));
              }
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase();
              if ([".cls", ".mac", ".inc", ".int", ".dfi", ".lut"].includes(ext)) {
                results.push(fullPath);
              }
            }
          }
        } catch (_) {}
        return results;
      };

      const files = await walk(searchDir);
      const sliced = maxResults && maxResults > 0 ? files.slice(0, maxResults) : files;
      return sliced.map((f) => Uri.file(f));
    } catch (_) {
      return [];
    }
  },

  onDidChangeConfiguration: () => new Disposable(),
  onDidSaveTextDocument: () => new Disposable(),
  onDidChangeTextDocument: () => new Disposable(),
  onDidCreateFiles: () => new Disposable(),
  onDidDeleteFiles: () => new Disposable(),
  onDidRenameFiles: () => new Disposable(),
  registerFileSearchProvider: () => new Disposable(),
  registerTextSearchProvider: () => new Disposable(),
  registerFileSystemProvider: () => new Disposable(),
};

// ---------------------------------------------------------------------------
// 8. Window Subsystem (vscode.window)
// ---------------------------------------------------------------------------

export const window = {
  createOutputChannel(name: string, _options?: any) {
    return new TerminalOutputChannel(name);
  },

  async showErrorMessage(message: string, ...items: string[]): Promise<string | undefined> {
    const isConflictPrompt =
      message.includes("The version of the file on the server is newer") ||
      message.includes("Failed to import");

    if (isConflictPrompt) {
      const policy = (activeRuntimeConfig["conflictPolicy"] || "fail").toLowerCase();
      if (policy === "overwrite") {
        console.warn(`\x1b[33m[CONFLICT]\x1b[0m ${message.split("\n")[0]}`);
        console.warn(`\x1b[33m[CONFLICT]\x1b[0m Force overwriting on server (conflictPolicy = 'overwrite')...`);
        return items.find((i) => i.toLowerCase().includes("overwrite")) || items[0];
      } else if (policy === "pull") {
        console.warn(`\x1b[33m[CONFLICT]\x1b[0m ${message.split("\n")[0]}`);
        console.info(`\x1b[34m[CONFLICT]\x1b[0m Pulling remote version into local file (conflictPolicy = 'pull')...`);
        return items.find((i) => i.toLowerCase().includes("pull")) || items[0];
      } else if (policy === "diff") {
        console.warn(`\x1b[33m[CONFLICT]\x1b[0m ${message.split("\n")[0]}`);
        console.info(`\x1b[36m[DIFF]\x1b[0m Generating diff against server copy (conflictPolicy = 'diff')...`);
        return items.find((i) => i.toLowerCase().includes("compare")) || items[0];
      } else {
        console.error(`\x1b[31m[CONFLICT]\x1b[0m 409 Conflict: ${message.split("\n")[0]}`);
        console.error(`\x1b[31m[FAIL]\x1b[0m Conflict resolution policy is 'fail'. Halting sync.`);
        return items.find((i) => i.toLowerCase().includes("cancel")) || "Cancel";
      }
    }

    console.error(`\x1b[31m[ERROR]\x1b[0m ${message}`);
    return items[0];
  },

  async showWarningMessage(message: string, ...items: string[]): Promise<string | undefined> {
    console.warn(`\x1b[33m[WARN]\x1b[0m ${message}`);
    return items[0];
  },

  async showInformationMessage(message: string, ...items: string[]): Promise<string | undefined> {
    console.log(`\x1b[32m[INFO]\x1b[0m ${message}`);
    return items[0];
  },

  async showQuickPick(items: any, _options?: any): Promise<any> {
    if (Array.isArray(items) && items.length > 0) {
      return items[0];
    }
    return undefined;
  },

  async showInputBox(options?: any): Promise<string | undefined> {
    return options?.value;
  },

  async withProgress<R>(_options: any, task: (progress: any, token: CancellationToken) => Promise<R>): Promise<R> {
    const cts = new CancellationTokenSource();
    return await task({ report: (_val: any) => {} }, cts.token);
  },

  createStatusBarItem(_alignment?: any, _priority?: number) {
    return {
      text: "",
      tooltip: "",
      command: "",
      show() {},
      hide() {},
      dispose() {},
    };
  },

  createTerminal(options?: any) {
    return {
      name: options?.name ?? "headless",
      processId: Promise.resolve(process.pid),
      sendText: (_text: string) => {},
      show: () => {},
      hide: () => {},
      dispose: () => {},
    };
  },

  activeTextEditor: undefined,
  visibleTextEditors: [],
  onDidChangeActiveTextEditor: () => new Disposable(),
  createTextEditorDecorationType: () => ({ dispose: () => {} }),
  registerTerminalProfileProvider: () => new Disposable(),
  showTextDocument: async () => {},
  registerCustomEditorProvider: () => new Disposable(),
  registerFileDecorationProvider: () => new Disposable(),
  registerTreeDataProvider: () => new Disposable(),
  createTreeView: () => ({ dispose: () => {} }),
  registerWebviewViewProvider: () => new Disposable(),
  registerWebviewPanelSerializer: () => new Disposable(),
};

// ---------------------------------------------------------------------------
// 9. Extensions & Commands Subsystems
// ---------------------------------------------------------------------------

export const extensions = {
  getExtension(id: string) {
    return {
      id,
      packageJSON: {
        version: "3.8.6",
        aiKey: "",
        contributes: {
          customEditors: [{ viewType: "lowCode" }],
          configuration: {},
        },
      },
      isActive: true,
      exports: {
        getServerSpec: async (name: string) => {
          const servers = activeRuntimeConfig["intersystems.servers"] || {};
          return servers[name] || servers[name.toLowerCase()] || undefined;
        },
        getAccount: () => undefined,
      },
      activate: async () => {},
    };
  },
  all: [],
  onDidChange: () => new Disposable(),
};

const commandRegistry = new Map<string, (...args: any[]) => any>();

async function renderUnifiedDiff(leftUri: any, rightUri: any, title?: string): Promise<void> {
  let leftContent = "";
  let rightContent = "";

  if (leftUri) {
    if (leftUri.scheme === "file") {
      try {
        leftContent = await fs.readFile(leftUri.fsPath, "utf8");
      } catch (_) {}
    } else {
      try {
        const docName = path.basename(leftUri.path || leftUri.fsPath);
        const { AtelierAPI } = require("../api");
        const api = new AtelierAPI(leftUri);
        const res = await api.getDoc(docName, leftUri, undefined, false, false);
        const c = res.result?.content;
        leftContent = Array.isArray(c) ? c.join("\n") : (c || "").toString();
      } catch (_) {}
    }
  }

  if (rightUri) {
    if (rightUri.scheme === "file") {
      try {
        rightContent = await fs.readFile(rightUri.fsPath, "utf8");
      } catch (_) {}
    }
  }

  const leftLines = leftContent.split(/\r?\n/);
  const rightLines = rightContent.split(/\r?\n/);

  console.log(`\n============================================================`);
  console.log(` DIFF: ${title || `${leftUri?.fsPath || "Left"} ↔ ${rightUri?.fsPath || "Right"}`}`);
  console.log(`============================================================`);
  console.log(`--- Server / Remote`);
  console.log(`+++ Local Disk`);

  const maxLen = Math.max(leftLines.length, rightLines.length);
  for (let i = 0; i < maxLen; i++) {
    const l = leftLines[i];
    const r = rightLines[i];
    if (l === r) {
      console.log(` ${l ?? ""}`);
    } else {
      if (l !== undefined) console.log(`\x1b[31m-${l}\x1b[0m`);
      if (r !== undefined) console.log(`\x1b[32m+${r}\x1b[0m`);
    }
  }
  console.log(`============================================================\n`);
}

export const commands = {
  registerCommand(command: string, callback: (...args: any[]) => any): Disposable {
    commandRegistry.set(command, callback);
    return new Disposable(() => {
      commandRegistry.delete(command);
    });
  },
  async executeCommand<T>(command: string, ...rest: any[]): Promise<T | undefined> {
    if (command === "vscode.diff") {
      const [leftUri, rightUri, title] = rest;
      await renderUnifiedDiff(leftUri, rightUri, title);
      return undefined;
    }
    const handler = commandRegistry.get(command);
    if (handler) {
      return await handler(...rest);
    }
    return undefined;
  },
  async getCommands(): Promise<string[]> {
    return Array.from(commandRegistry.keys());
  },
};

export const languages = {
  registerHoverProvider: () => new Disposable(),
  registerDefinitionProvider: () => new Disposable(),
  registerCompletionItemProvider: () => new Disposable(),
  registerDocumentSymbolProvider: () => new Disposable(),
  registerDocumentFormattingEditProvider: () => new Disposable(),
  registerCodeLensProvider: () => new Disposable(),
  registerFoldingRangeProvider: () => new Disposable(),
  createDiagnosticCollection: () => ({
    clear: () => {},
    delete: () => {},
    dispose: () => {},
    get: () => undefined,
    has: () => false,
    set: () => {},
  }),
  match: () => 10,
};

export const debug = {
  registerDebugConfigurationProvider: () => new Disposable(),
  registerDebugAdapterDescriptorFactory: () => new Disposable(),
  startDebugging: async () => false,
  onDidStartDebugSession: () => new Disposable(),
  onDidTerminateDebugSession: () => new Disposable(),
};

export const authentication = {
  getSession: async () => undefined,
  registerAuthenticationProvider: () => new Disposable(),
};

export const env = {
  appName: "iris-sync",
  appRoot: process.cwd(),
  language: "en",
  machineId: "headless-machine",
  sessionId: "headless-session",
  clipboard: {
    readText: async () => "",
    writeText: async () => {},
  },
  openExternal: async () => false,
};

export const tests = {
  createTestController: () => ({
    items: { add: () => {}, replace: () => {}, delete: () => {} },
    createRunProfile: () => ({ dispose: () => {} }),
    dispose: () => {},
  }),
};

// ---------------------------------------------------------------------------
// 10. Additional Enums, Classes & Stubs Required by Upstream AST Parity
// ---------------------------------------------------------------------------

export enum FilePermission {
  Readonly = 1,
}

export enum SyntaxTokenType {
  Other = 0,
  Comment = 1,
  String = 2,
  RegEx = 3,
}

export enum IndentAction {
  None = 0,
  Indent = 1,
  IndentOutdent = 2,
  Outdent = 3,
}

export enum TerminalLocation {
  Panel = 1,
  Editor = 2,
}

export enum QuickInputButtonLocation {
  Title = 1,
  Inline = 2,
}

export const QuickInputButtons = {
  Back: { iconPath: new ThemeIcon("arrow-left") },
};

export enum TextSearchCompleteMessageType {
  Information = 1,
  Warning = 2,
}

export enum TextDocumentChangeReason {
  Undo = 1,
  Redo = 2,
}

export class SemanticTokensLegend {
  constructor(public readonly tokenTypes: string[] = [], public readonly tokenModifiers: string[] = []) {}
}

export class Hover {
  constructor(public readonly contents: any, public readonly range?: Range) {}
}

export class TabInputText {
  constructor(public readonly uri: URI) {}
}

export class TabInputCustom {
  constructor(public readonly uri: URI, public readonly viewType: string) {}
}

export class TabInputTextDiff {
  constructor(public readonly original: URI, public readonly modified: URI) {}
}

export class FileDecoration {
  constructor(public readonly badge?: string, public readonly tooltip?: string, public readonly color?: ThemeColor) {}
}

export class TestMessage {
  constructor(public readonly message: string | MarkdownString) {}
}

export class TestRunRequest {
  constructor(public readonly include?: any[], public readonly exclude?: any[], public readonly profile?: any) {}
}

export class Progress<T = any> {
  public report(_value: T): void {}
}

export class TextSearchComplete {}
export class TextSearchResult {}
export class TextSearchQuery {}
export class TextSearchCompleteMessage {}
export class FileSearchQuery {}

// Function stubs accessed directly on vscode namespace
export const diff = () => {};
export const open = () => {};
export const openWith = () => {};
export const getState = () => undefined;
export const setState = () => {};
export const postMessage = () => {};
export const executeDocumentSymbolProvider = () => Promise.resolve([]);
export const provideDocumentSemanticTokensLegend = () => undefined;

// Type & Interface Stubs (represented as dummy classes to satisfy value positions)

export class QuickPickOptions {}
export class QuickPickItem {}
export class WorkspaceFolder {}
export class TextDocument {}
export class WebviewPanel {}
export class TextEditor {}
export class TextEditorSelectionChangeEvent {}
export class Extension {}
export class TestItem {}
export class TestController {}
export class ExtensionContext {}
export class TextDocumentShowOptions {}
export class Pseudoterminal {}
export class Event {}
export class TerminalDimensions {}
export class ExtensionTerminalOptions {}
export class TerminalProfileProvider {}
export class DebugAdapterDescriptorFactory {}
export class DebugSession {}
export class DebugAdapterExecutable {}
export class ProviderResult {}
export class DebugAdapterDescriptor {}
export class DebugAdapterServer {}
export class TreeDataProvider {}
export class Memento {}
export class StatusBarItem {}
export class Terminal {}
export class WorkspaceConfiguration {}
export class ConfigurationScope {}
export class FileCreateEvent {}
export class LanguageConfiguration {}
export class CodeActionProvider {}
export class CodeActionContext {}
export class Command {}
export class TextDocumentContentProvider {}
export class DocumentFormattingEditProvider {}
export class FormattingOptions {}
export class DocumentLinkProvider {}
export class FileDecorationProvider {}
export class FileSearchProvider {}
export class FileSearchOptions {}
export class FileStat {}
export class FileSystemProvider {}
export class FileChangeEvent {}
export class TextSearchProvider {}
export class TextSearchOptions {}
export class CustomTextEditorProvider {}
export class FoldingRangeProvider {}
export class FoldingContext {}
export class DocumentSymbolProvider {}
export class CodeLensProvider {}
export class CompletionItemProvider {}
export class CompletionContext {}
export class DefinitionProvider {}
export class DefinitionLink {}
export class DiagnosticCollection {}
export class HoverProvider {}
export class WorkspaceSymbolProvider {}
export class FileSystemWatcher {}

// ---------------------------------------------------------------------------
// 11. Persistent Workspace State (Memento) & Context Factory
// ---------------------------------------------------------------------------

export const workspaceState = new HeadlessMemento();

export function createMockExtensionContext(): any {
  return {
    subscriptions: [],
    workspaceState,
    globalState: workspaceState,
    extensionPath: path.resolve(__dirname, "../.."),
    storagePath: path.resolve(process.cwd(), ".iris-sync-storage"),
    globalStoragePath: path.resolve(process.cwd(), ".iris-sync-global-storage"),
    logPath: path.resolve(process.cwd(), ".iris-sync-logs"),
    extensionUri: Uri.file(path.resolve(__dirname, "../..")),
    environmentVariableCollection: {
      persistent: true,
      replace: () => {},
      append: () => {},
      prepend: () => {},
      get: () => undefined,
      forEach: () => {},
      delete: () => {},
      clear: () => {},
    },
    extensionMode: ExtensionMode.Production,
    asAbsolutePath: (relativePath: string) => path.resolve(__dirname, "../..", relativePath),
    storageUri: Uri.file(path.resolve(process.cwd(), ".iris-sync-storage")),
    globalStorageUri: Uri.file(path.resolve(process.cwd(), ".iris-sync-global-storage")),
    logUri: Uri.file(path.resolve(process.cwd(), ".iris-sync-logs")),
    secrets: {
      get: async () => undefined,
      store: async () => {},
      delete: async () => {},
      onDidChange: () => new Disposable(),
    },
    extension: {
      id: "intersystems-community.vscode-objectscript",
      extensionUri: Uri.file(path.resolve(__dirname, "../..")),
      extensionPath: path.resolve(__dirname, "../.."),
      isActive: true,
      packageJSON: {
        version: "3.8.6",
        aiKey: "",
        contributes: {
          customEditors: [{ viewType: "lowCode" }],
          configuration: {},
        },
      },
      extensionKind: ExtensionKind.Workspace,
      exports: {},
      activate: async () => {},
    },
  };
}

export { HeadlessMemento };
