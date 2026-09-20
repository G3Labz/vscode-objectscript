/**
 * src/headless/daemon.ts
 *
 * Background Service Daemonization & OS Unit Generator for iris-sync.
 * Provides PID management, detached watcher spawning, and systemd/launchd generators.
 */

import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";
import { logger } from "./terminalLogger";

export interface DaemonOptions {
  dir?: string;
  flags?: string;
  coexist?: boolean;
  conflict?: string;
  server?: string;
  namespace?: string;
}

export function getDaemonDirectory(cwd?: string): string {
  const root = cwd || process.cwd();
  return path.resolve(root, ".iris-sync");
}

export function getDaemonPidFile(cwd?: string): string {
  return path.join(getDaemonDirectory(cwd), "daemon.pid");
}

export function getDaemonLogFile(cwd?: string): string {
  return path.join(getDaemonDirectory(cwd), "daemon.log");
}

/**
 * Checks if a daemon process is currently running.
 */
export function isDaemonRunning(cwd?: string): { running: boolean; pid?: number } {
  const pidFile = getDaemonPidFile(cwd);
  if (!fs.existsSync(pidFile)) {
    return { running: false };
  }

  try {
    const content = fs.readFileSync(pidFile, "utf8").trim();
    const pid = parseInt(content, 10);
    if (isNaN(pid)) {
      fs.unlinkSync(pidFile);
      return { running: false };
    }

    // Check if process exists by sending signal 0
    process.kill(pid, 0);
    return { running: true, pid };
  } catch (err: any) {
    // ESRCH means process does not exist
    try {
      fs.unlinkSync(pidFile);
    } catch (_) {}
    return { running: false };
  }
}

/**
 * Spawns a background watcher process detached from the current terminal.
 */
export function startDaemon(
  options: DaemonOptions = {},
  cwd?: string
): { success: boolean; pid?: number; message?: string } {
  const check = isDaemonRunning(cwd);
  if (check.running) {
    return {
      success: false,
      pid: check.pid,
      message: `Daemon is already running with PID ${check.pid}.`,
    };
  }

  const root = cwd || process.cwd();
  const dir = getDaemonDirectory(root);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const logFile = getDaemonLogFile(root);
  const outFd = fs.openSync(logFile, "a");
  const errFd = fs.openSync(logFile, "a");

  // Determine CLI entrypoint
  const cliScript = path.resolve(__dirname, "../../dist/cli/iris-sync.js");
  const args = [cliScript, "watch"];

  if (options.dir) args.push("--dir", options.dir);
  if (options.flags) args.push("--flags", options.flags);
  if (options.conflict) args.push("--conflict", options.conflict);
  if (options.server) args.push("--server", options.server);
  if (options.namespace) args.push("--namespace", options.namespace);
  if (options.coexist) args.push("--coexist");

  const child = child_process.spawn(process.execPath, args, {
    cwd: root,
    detached: true,
    stdio: ["ignore", outFd, errFd],
    env: process.env,
  });

  if (!child.pid) {
    return { success: false, message: "Failed to spawn child daemon process." };
  }

  fs.writeFileSync(getDaemonPidFile(root), `${child.pid}\n`, "utf8");
  child.unref();

  return {
    success: true,
    pid: child.pid,
    message: `Daemon started successfully with PID ${child.pid}. Logging to ${logFile}`,
  };
}

/**
 * Stops the running background daemon.
 */
export function stopDaemon(cwd?: string): { success: boolean; message: string } {
  const check = isDaemonRunning(cwd);
  if (!check.running || !check.pid) {
    return { success: false, message: "No active daemon process found." };
  }

  try {
    process.kill(check.pid, "SIGTERM");
    const pidFile = getDaemonPidFile(cwd);
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
    return { success: true, message: `Daemon process (PID ${check.pid}) terminated.` };
  } catch (err: any) {
    return { success: false, message: `Could not terminate process ${check.pid}: ${err?.message || err}` };
  }
}

/**
 * Generates a systemd user service unit string.
 */
export function generateSystemdService(options: {
  workDir?: string;
  execPath?: string;
  nodePath?: string;
} = {}): string {
  const workDir = options.workDir || process.cwd();
  const node = options.nodePath || process.execPath;
  const exec = options.execPath || path.resolve(workDir, "dist/cli/iris-sync.js");

  return `[Unit]
Description=iris-sync Headless Background Synchronization Service
After=network.target

[Service]
Type=simple
WorkingDirectory=${workDir}
ExecStart=${node} ${exec} watch --coexist
Restart=on-failure
RestartSec=5s
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
`;
}

/**
 * Generates a macOS launchd agent plist string.
 */
export function generateLaunchdPlist(options: {
  label?: string;
  workDir?: string;
  execPath?: string;
  nodePath?: string;
} = {}): string {
  const label = options.label || "com.g3labz.iris-sync";
  const workDir = options.workDir || process.cwd();
  const node = options.nodePath || process.execPath;
  const exec = options.execPath || path.resolve(workDir, "dist/cli/iris-sync.js");
  const logFile = path.join(workDir, ".iris-sync", "daemon.log");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${label}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${node}</string>
        <string>${exec}</string>
        <string>watch</string>
        <string>--coexist</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${workDir}</string>
    <key>StandardOutPath</key>
    <string>${logFile}</string>
    <key>StandardErrorPath</key>
    <string>${logFile}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
`;
}
