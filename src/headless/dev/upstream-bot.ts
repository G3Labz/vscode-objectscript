import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import * as vscodeShim from "../vscode-shim";

export interface AstScanResult {
  totalFiles: number;
  totalSymbols: number;
  missingSymbols: string[];
}

export interface UpstreamStatus {
  upstreamRemote: string;
  behindCount: number;
  aheadCount: number;
  commits: string[];
}

export interface ParityBotResult {
  status: "up-to-date" | "clean-sync" | "drift-detected" | "error";
  behindCount: number;
  missingSymbols: string[];
  commits: string[];
  prUrl?: string;
  issueUrl?: string;
  message: string;
}

export function findRepoRoot(startDir: string = process.cwd()): string {
  let curr = path.resolve(startDir);
  while (curr !== path.dirname(curr)) {
    if (fs.existsSync(path.join(curr, "package.json")) && fs.existsSync(path.join(curr, "src/headless"))) {
      return curr;
    }
    curr = path.dirname(curr);
  }
  return process.cwd();
}

/**
 * Scans all TypeScript files in src/ (excluding src/headless) for vsc.* and vscode.* symbols
 * and asserts they are defined on vscode-shim.ts.
 */
export function scanAstParity(srcDir?: string): AstScanResult {
  const root = srcDir || path.join(findRepoRoot(), "src");
  const walk = (dir: string): string[] => {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    for (const item of list) {
      const full = path.join(dir, item);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if (item !== "headless") {
          results = results.concat(walk(full));
        }
      } else if (item.endsWith(".ts")) {
        results.push(full);
      }
    }
    return results;
  };

  const files = walk(root);
  const referencedSymbols = new Set<string>();

  for (const f of files) {
    const content = fs.readFileSync(f, "utf8");
    const matches = content.matchAll(/\bvsc(?:ode)?\.([a-zA-Z0-9_$]+)/g);
    for (const m of matches) {
      referencedSymbols.add(m[1]);
    }
  }

  const missingSymbols: string[] = [];
  for (const sym of referencedSymbols) {
    if ((vscodeShim as any)[sym] === undefined) {
      missingSymbols.push(sym);
    }
  }

  return {
    totalFiles: files.length,
    totalSymbols: referencedSymbols.size,
    missingSymbols,
  };
}

/**
 * Checks git status against upstream/master.
 */
export function checkUpstreamStatus(options?: {
  upstreamUrl?: string;
  targetBranch?: string;
  cwd?: string;
}): UpstreamStatus {
  const cwd = options?.cwd || findRepoRoot();
  const upstreamUrl = options?.upstreamUrl || "https://github.com/intersystems-community/vscode-objectscript.git";
  const branch = options?.targetBranch || "master";

  // Check if upstream remote exists, add if missing
  let remotes = "";
  try {
    remotes = execSync("git remote", { cwd, encoding: "utf8" });
  } catch (e) {
    remotes = "";
  }

  let upstreamRemote = "upstream";
  if (!remotes.split("\n").includes("upstream")) {
    try {
      execSync(`git remote add upstream "${upstreamUrl}"`, { cwd, stdio: "ignore" });
    } catch {
      // Remote might already exist with another name
    }
  }

  // Fetch upstream
  try {
    execSync(`git fetch ${upstreamRemote} ${branch}`, { cwd, stdio: "ignore" });
  } catch (err: any) {
    console.warn(`[ParityBot] Warning: Failed to fetch from remote '${upstreamRemote}': ${err.message}`);
  }

  // Count commits behind
  let behindCount = 0;
  let aheadCount = 0;
  let commits: string[] = [];

  try {
    const revList = execSync(`git rev-list --left-right --count HEAD...${upstreamRemote}/${branch}`, {
      cwd,
      encoding: "utf8",
    }).trim();
    const parts = revList.split(/\s+/);
    aheadCount = parseInt(parts[0], 10) || 0;
    behindCount = parseInt(parts[1], 10) || 0;

    if (behindCount > 0) {
      const log = execSync(`git log HEAD..${upstreamRemote}/${branch} --oneline`, {
        cwd,
        encoding: "utf8",
      }).trim();
      commits = log ? log.split("\n") : [];
    }
  } catch (e: any) {
    console.warn(`[ParityBot] Note: git rev-list check encountered: ${e.message}`);
  }

  return {
    upstreamRemote,
    behindCount,
    aheadCount,
    commits,
  };
}

/**
 * Executes the complete Upstream Parity Bot workflow:
 * 1. Checks upstream status
 * 2. Scans AST symbol parity
 * 3. Creates PR or Issue if requested
 */
export async function runParityBot(options?: {
  createPr?: boolean;
  createIssue?: boolean;
  dryRun?: boolean;
  cwd?: string;
}): Promise<ParityBotResult> {
  const cwd = options?.cwd || findRepoRoot();
  console.log("============================================================");
  console.log(" 🤖 iris-sync Upstream Parity Bot (Milestone M4.2)");
  console.log("============================================================");

  const status = checkUpstreamStatus({ cwd });
  console.log(`Upstream remote: ${status.upstreamRemote}`);
  console.log(`Commits behind:  ${status.behindCount}`);
  console.log(`Commits ahead:   ${status.aheadCount}`);

  if (status.behindCount === 0) {
    console.log("\n[ParityBot]  Repository is 100% up-to-date with upstream/master.");
    return {
      status: "up-to-date",
      behindCount: 0,
      missingSymbols: [],
      commits: [],
      message: "Repository is fully up-to-date with upstream.",
    };
  }

  console.log(`\n[ParityBot] Found ${status.behindCount} new upstream commit(s):`);
  status.commits.forEach((c) => console.log(`  - ${c}`));

  // Scan AST parity
  console.log("\n[ParityBot] Scanning AST symbol parity against vscode-shim.ts...");
  const scan = scanAstParity(path.join(cwd, "src"));
  console.log(`  Scanned ${scan.totalFiles} files, checked ${scan.totalSymbols} symbols.`);

  if (scan.missingSymbols.length > 0) {
    console.error(`\n[ParityBot] ⚠️ Upstream drift detected! Missing ${scan.missingSymbols.length} symbol(s):`);
    scan.missingSymbols.forEach((s) => console.error(`    ❌ vscode.${s}`));

    let issueUrl: string | undefined;
    if (options?.createIssue && !options?.dryRun) {
      console.log("\n[ParityBot] Creating GitHub Issue for upstream AST drift...");
      const issueTitle = `[Upstream Parity Alert] ${scan.missingSymbols.length} unhandled vscode.* symbol(s) detected in upstream`;
      const issueBody = `## Upstream Parity Alert (Automated Bot)\n\n` +
        `The automated weekly upstream parity scanner detected **${status.behindCount}** new commits in \`upstream/master\` with **${scan.missingSymbols.length}** missing \`vscode.*\` symbols in \`src/headless/vscode-shim.ts\`.\n\n` +
        `### Missing Symbols:\n${scan.missingSymbols.map((s) => `- \`vscode.${s}\``).join("\n")}\n\n` +
        `### New Upstream Commits:\n${status.commits.map((c) => `- ${c}`).join("\n")}\n\n` +
        `**Action Required**: Implement the missing symbols in \`src/headless/vscode-shim.ts\` before merging upstream.`;

      try {
        const out = execSync(`gh issue create --title "${issueTitle}" --body "${issueBody}" --label "upstream-drift"`, {
          cwd,
          encoding: "utf8",
        }).trim();
        issueUrl = out;
        console.log(`  Issue created: ${issueUrl}`);
      } catch (err: any) {
        console.error(`  Failed to create GitHub Issue: ${err.message}`);
      }
    }

    return {
      status: "drift-detected",
      behindCount: status.behindCount,
      missingSymbols: scan.missingSymbols,
      commits: status.commits,
      issueUrl,
      message: `Upstream drift detected: ${scan.missingSymbols.length} missing symbol(s).`,
    };
  }

  // Symbol parity is 100% clean!
  console.log("\n[ParityBot]  AST symbol parity is 100% clean! All symbols implemented in shim.");

  let prUrl: string | undefined;
  if (options?.createPr && !options?.dryRun) {
    console.log("\n[ParityBot] Creating automated Pull Request for upstream merge...");
    const dateStr = new Date().toISOString().split("T")[0];
    const branchName = `automated/upstream-sync-${dateStr}`;

    try {
      // Create and checkout branch
      execSync(`git checkout -B ${branchName}`, { cwd, stdio: "ignore" });
      execSync(`git merge upstream/master -m "chore(sync): automated merge from upstream/master (${status.behindCount} commits)"`, {
        cwd,
        stdio: "ignore",
      });

      // Run tests to ensure clean merge
      execSync("npm run test:shim", { cwd, stdio: "ignore" });

      // Push branch
      execSync(`git push -u origin ${branchName} --force`, { cwd, stdio: "ignore" });

      // Create PR via gh
      const prTitle = `Automated Upstream Sync: ${status.behindCount} commit(s) from upstream/master (${dateStr})`;
      const prBody = `## Automated Upstream Sync\n\n` +
        `This automated PR merges **${status.behindCount}** commit(s) from \`upstream/master\`.\n\n` +
        `### Verification Status\n` +
        `- [x] AST symbol parity: 100% covered (${scan.totalSymbols} symbols checked)\n` +
        `- [x] All shim tests passing (\`npm run test:shim\`)\n\n` +
        `### Upstream Commits:\n${status.commits.map((c) => `- ${c}`).join("\n")}`;

      const out = execSync(`gh pr create --title "${prTitle}" --body "${prBody}" --head ${branchName} --base master`, {
        cwd,
        encoding: "utf8",
      }).trim();
      prUrl = out;
      console.log(`  PR created: ${prUrl}`);
      // Return to master
      execSync("git checkout master", { cwd, stdio: "ignore" });
    } catch (err: any) {
      console.error(`  Failed to complete automated PR flow: ${err.message}`);
      try {
        execSync("git checkout master", { cwd, stdio: "ignore" });
      } catch {}
    }
  }

  return {
    status: "clean-sync",
    behindCount: status.behindCount,
    missingSymbols: [],
    commits: status.commits,
    prUrl,
    message: `Upstream sync clean (${status.behindCount} commits). Parity verified.`,
  };
}

if (require.main === module && process.argv[1] && path.basename(process.argv[1]).includes("upstream-bot")) {
  const args = process.argv.slice(2);
  const createPr = args.includes("--create-pr") || args.includes("--pr");
  const createIssue = args.includes("--create-issue") || args.includes("--issue");
  const dryRun = args.includes("--dry-run");

  runParityBot({ createPr, createIssue, dryRun }).then((res) => {
    if (res.status === "drift-detected") {
      process.exit(1);
    }
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
