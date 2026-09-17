import * as fs from "fs";
import * as path from "path";

/**
 * Headless Memento implementation backing workspaceState and globalState.
 * Persists cached timestamps and metadata to .iris-sync/cache.json (with root fallback).
 */
export class HeadlessMemento {
  private storage: Record<string, any> = {};
  private cacheFilePath: string;

  constructor(customPath?: string) {
    if (customPath) {
      this.cacheFilePath = customPath;
    } else {
      const canonical = path.resolve(process.cwd(), ".iris-sync", "cache.json");
      const legacy = path.resolve(process.cwd(), ".iris-sync-cache.json");
      if (fs.existsSync(canonical)) {
        this.cacheFilePath = canonical;
      } else if (fs.existsSync(legacy)) {
        this.cacheFilePath = legacy;
      } else {
        this.cacheFilePath = canonical;
      }
    }
    this.load();
  }

  public get<T>(key: string): T | undefined;
  public get<T>(key: string, defaultValue: T): T;
  public get<T>(key: string, defaultValue?: T): T | undefined {
    if (key in this.storage) {
      return this.storage[key];
    }
    return defaultValue;
  }

  public async update(key: string, value: any): Promise<void> {
    if (value === undefined) {
      delete this.storage[key];
    } else {
      this.storage[key] = value;
    }
    this.save();
  }

  public keys(): readonly string[] {
    return Object.keys(this.storage).filter((k) => k !== "$schema");
  }

  public setCachePath(filePath: string): void {
    this.cacheFilePath = filePath;
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        const raw = fs.readFileSync(this.cacheFilePath, "utf8");
        this.storage = JSON.parse(raw);
      }
      if (!this.storage["$schema"]) {
        this.storage["$schema"] = "https://raw.githubusercontent.com/G3Labz/vscode-objectscript/master/schemas/iriscache.schema.json";
      }
    } catch (_) {
      this.storage = {
        $schema: "https://raw.githubusercontent.com/G3Labz/vscode-objectscript/master/schemas/iriscache.schema.json",
      };
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const dataToPersist = {
        $schema: this.storage["$schema"] || "https://raw.githubusercontent.com/G3Labz/vscode-objectscript/master/schemas/iriscache.schema.json",
        ...this.storage,
      };
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(dataToPersist, null, 2), "utf8");
    } catch (_) {
      // Ignore write errors in read-only environments
    }
  }
}
