/**
 * src/headless/production.ts
 *
 * InterSystems IRIS Interoperability Production Config Item Lifecycle Engine (Milestone M4.5).
 * Enables safe programmatic hot-restarting of Business Operations, Business Services,
 * and Business Processes managed by Ens.Director.
 */

import { AtelierAPI } from "../api";
import { logger } from "./terminalLogger";
import { ResolvedConfig } from "./configBridge";

export const INFLIGHT_MESSAGE_QUEUE_WARNING = `
⚠️  CAUTION: Inflight Message Queue & Transaction Risk
Restarting a production host or cycling configuration items will terminate and respawn
the background worker process (Ens.Job). If messages are actively being processed, this may cause:
  - Aborted SQL / socket / HTTP transactions
  - Temporary message queue stalls or retries
  - Connection reconnect cycles on external adapters
Hot-restarting should only be triggered once intermediate code changes are complete.
`;

export interface ProductionOperationResult {
  success: boolean;
  message: string;
  item?: string;
  action: "restartHost" | "updateProduction" | "enableConfigItem" | "toggle";
  timestamp: string;
}

/**
 * Creates and invokes the SQL ObjectScript stored procedure helper.
 */
async function executeObjectScriptProcedure(
  api: AtelierAPI,
  namespace: string,
  procSql: string,
  callSql: string,
  parameters: any[] = []
): Promise<{ success: boolean; output: string }> {
  try {
    // 1. Create or replace stored procedure
    await (api as any).request(1, "POST", `${namespace}/action/query`, {
      query: procSql,
      parameters: [],
    });

    // 2. Call stored procedure
    const callRes = await (api as any).request(1, "POST", `${namespace}/action/query`, {
      query: callSql,
      parameters,
    });

    const rows = callRes.result?.content || [];
    let output = "OK";
    if (rows.length > 0 && rows[0]) {
      const firstRow = rows[0];
      const keys = Object.keys(firstRow);
      if (keys.length > 0) {
        output = String(firstRow[keys[0]] || "");
      }
    }

    if (output.startsWith("ERROR:")) {
      return { success: false, output };
    }
    return { success: true, output };
  } catch (err: any) {
    return {
      success: false,
      output: err?.message || String(err),
    };
  }
}

/**
 * Gracefully restarts a single Business Operation / Service / Process host.
 * Calls: Do ##class(Ens.Director).RestartHost(pHost)
 */
export async function restartProductionHost(
  api: AtelierAPI,
  namespace: string,
  hostName: string
): Promise<ProductionOperationResult> {
  const timestamp = new Date().toISOString();
  logger.info(`[Production] Restarting host '${hostName}' in [${namespace}] via Ens.Director.RestartHost...`);

  const procSql = `
CREATE OR REPLACE PROCEDURE IrisSyncRestartHost(pHost VARCHAR(255))
RETURNS VARCHAR(500)
LANGUAGE OBJECTSCRIPT
{
    Try {
        Do ##class(Ens.Director).RestartHost(pHost)
        Return "OK"
    } Catch ex {
        Return "ERROR: "_ex.DisplayString()
    }
}`;

  const callSql = "SELECT IrisSyncRestartHost(?) AS Result";
  const res = await executeObjectScriptProcedure(api, namespace, procSql, callSql, [hostName]);

  if (res.success) {
    logger.success(`[Production] Host '${hostName}' successfully restarted.`);
    return {
      success: true,
      message: `Successfully restarted production host '${hostName}'.`,
      item: hostName,
      action: "restartHost",
      timestamp,
    };
  } else {
    logger.error(`[Production] Failed to restart host '${hostName}': ${res.output}`);
    return {
      success: false,
      message: `Failed to restart production host '${hostName}': ${res.output}`,
      item: hostName,
      action: "restartHost",
      timestamp,
    };
  }
}

/**
 * Reloads the running production configuration across all hosts.
 * Calls: Do ##class(Ens.Director).UpdateProduction()
 */
export async function updateProduction(
  api: AtelierAPI,
  namespace: string
): Promise<ProductionOperationResult> {
  const timestamp = new Date().toISOString();
  logger.info(`[Production] Updating production in [${namespace}] via Ens.Director.UpdateProduction...`);

  const procSql = `
CREATE OR REPLACE PROCEDURE IrisSyncUpdateProduction()
RETURNS VARCHAR(500)
LANGUAGE OBJECTSCRIPT
{
    Try {
        Do ##class(Ens.Director).UpdateProduction()
        Return "OK"
    } Catch ex {
        Return "ERROR: "_ex.DisplayString()
    }
}`;

  const callSql = "SELECT IrisSyncUpdateProduction() AS Result";
  const res = await executeObjectScriptProcedure(api, namespace, procSql, callSql, []);

  if (res.success) {
    logger.success(`[Production] Production updated successfully.`);
    return {
      success: true,
      message: `Successfully updated production configuration in [${namespace}].`,
      action: "updateProduction",
      timestamp,
    };
  } else {
    logger.error(`[Production] Failed to update production: ${res.output}`);
    return {
      success: false,
      message: `Failed to update production: ${res.output}`,
      action: "updateProduction",
      timestamp,
    };
  }
}

/**
 * Sets config item enabled state (0 or 1).
 * Calls: set tSC = ##class(Ens.Director).EnableConfigItem(pItem, pEnable)
 */
export async function setConfigItemEnabled(
  api: AtelierAPI,
  namespace: string,
  hostName: string,
  enable: boolean
): Promise<ProductionOperationResult> {
  const timestamp = new Date().toISOString();
  const enableInt = enable ? 1 : 0;
  const verb = enable ? "Enabling" : "Disabling";
  logger.info(`[Production] ${verb} config item '${hostName}' in [${namespace}]...`);

  const procSql = `
CREATE OR REPLACE PROCEDURE IrisSyncEnableConfigItem(pItem VARCHAR(255), pEnable INTEGER)
RETURNS VARCHAR(500)
LANGUAGE OBJECTSCRIPT
{
    Try {
        Set tSC = ##class(Ens.Director).EnableConfigItem(pItem, pEnable)
        If $$$ISERR(tSC) Return "ERROR: "_$system.Status.GetErrorText(tSC)
        Return "OK"
    } Catch ex {
        Return "ERROR: "_ex.DisplayString()
    }
}`;

  const callSql = "SELECT IrisSyncEnableConfigItem(?, ?) AS Result";
  const res = await executeObjectScriptProcedure(api, namespace, procSql, callSql, [hostName, enableInt]);

  if (res.success) {
    logger.success(`[Production] Config item '${hostName}' ${enable ? "enabled" : "disabled"} successfully.`);
    return {
      success: true,
      message: `Config item '${hostName}' is now ${enable ? "enabled" : "disabled"}.`,
      item: hostName,
      action: "enableConfigItem",
      timestamp,
    };
  } else {
    logger.error(`[Production] Failed to ${verb.toLowerCase()} config item '${hostName}': ${res.output}`);
    return {
      success: false,
      message: `Failed to ${verb.toLowerCase()} config item '${hostName}': ${res.output}`,
      item: hostName,
      action: "enableConfigItem",
      timestamp,
    };
  }
}

/**
 * Cycles an item by disabling and re-enabling it with a delay.
 */
export async function toggleConfigItem(
  api: AtelierAPI,
  namespace: string,
  hostName: string,
  delayMs: number = 1000
): Promise<ProductionOperationResult> {
  const timestamp = new Date().toISOString();
  logger.info(`[Production] Cycling config item '${hostName}' (disable -> wait ${delayMs}ms -> enable)...`);

  const disRes = await setConfigItemEnabled(api, namespace, hostName, false);
  if (!disRes.success) {
    return {
      success: false,
      message: `Cycle failed on disable step: ${disRes.message}`,
      item: hostName,
      action: "toggle",
      timestamp,
    };
  }

  await new Promise((resolve) => setTimeout(resolve, delayMs));

  const enRes = await setConfigItemEnabled(api, namespace, hostName, true);
  if (!enRes.success) {
    return {
      success: false,
      message: `Cycle failed on re-enable step: ${enRes.message}`,
      item: hostName,
      action: "toggle",
      timestamp,
    };
  }

  logger.success(`[Production] Config item '${hostName}' successfully cycled.`);
  return {
    success: true,
    message: `Config item '${hostName}' successfully cycled (disable -> enable).`,
    item: hostName,
    action: "toggle",
    timestamp,
  };
}
