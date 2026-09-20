/**
 * src/headless/terminalLogger.ts
 * Standalone terminal streaming implementation of vscode.OutputChannel.
 */

let quietStdout = false;

export function setQuietStdout(quiet: boolean): void {
  quietStdout = quiet;
}

export function isQuietStdout(): boolean {
  return quietStdout;
}

export class TerminalOutputChannel {
  constructor(public readonly name: string) {}

  public append(value: string): void {
    if (quietStdout) {
      process.stderr.write(value);
    } else {
      process.stdout.write(value);
    }
  }

  public appendLine(value: string): void {
    if (quietStdout) {
      process.stderr.write(`[${this.name}] ${value}\n`);
      return;
    }
    if (value.startsWith("[ERROR]") || value.includes("Compile error")) {
      console.error(`\x1b[31m[${this.name}] ${value}\x1b[0m`);
    } else if (value.startsWith("[WARN]")) {
      console.warn(`\x1b[33m[${this.name}] ${value}\x1b[0m`);
    } else {
      console.log(`[${this.name}] ${value}`);
    }
  }

  public replace(value: string): void {
    this.clear();
    this.append(value);
  }

  public clear(): void {}
  public show(_preserveFocus?: boolean): void {}
  public hide(): void {}
  public dispose(): void {}
}

export const logger = {
  info: (msg: string) => {
    if (quietStdout) {
      process.stderr.write(`\x1b[32m[INFO]\x1b[0m ${msg}\n`);
    } else {
      console.log(`\x1b[32m[INFO]\x1b[0m ${msg}`);
    }
  },
  warn: (msg: string) => {
    if (quietStdout) {
      process.stderr.write(`\x1b[33m[WARN]\x1b[0m ${msg}\n`);
    } else {
      console.warn(`\x1b[33m[WARN]\x1b[0m ${msg}`);
    }
  },
  error: (msg: string) => {
    process.stderr.write(`\x1b[31m[ERROR]\x1b[0m ${msg}\n`);
  },
  debug: (msg: string) => {
    if (process.env.DEBUG || process.env.IRIS_DEBUG) {
      if (quietStdout) {
        process.stderr.write(`\x1b[36m[DEBUG]\x1b[0m ${msg}\n`);
      } else {
        console.log(`\x1b[36m[DEBUG]\x1b[0m ${msg}`);
      }
    }
  },
  success: (msg: string) => {
    if (quietStdout) {
      process.stderr.write(`\x1b[32m[PASS]\x1b[0m ${msg}\n`);
    } else {
      console.log(`\x1b[32m[PASS]\x1b[0m ${msg}`);
    }
  },
};
