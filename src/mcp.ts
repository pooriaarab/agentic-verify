import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  createLogger,
  getCostReport,
  GuardError,
  VendorError,
  type Guards,
  type Logger,
} from "./core.js";
import { DEFAULT_BRAND } from "./index.js";
import {
  LocalVerifyAdapter,
  resolveAdapter,
  verifyEmail,
  type AdapterName,
  type VerifyAdapter,
} from "./verify.js";

export interface McpDeps {
  adapter?: VerifyAdapter;
  guards?: Guards;
  logger?: Logger;
}

const adapterName = z
  .enum(["local", "millionverifier", "zerobounce"])
  .optional()
  .describe("Which checker runs. Defaults to local.");

function errorResult(error: unknown): {
  content: { type: "text"; text: string }[];
  isError: true;
} {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
}

function okResult(value: unknown): {
  content: { type: "text"; text: string }[];
} {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

export function createMcpServer(deps: McpDeps = {}): McpServer {
  const fallback = deps.adapter ?? new LocalVerifyAdapter();
  const guards = deps.guards;
  const logger = deps.logger ?? createLogger({ quiet: true });
  const server = new McpServer({
    name: DEFAULT_BRAND.command,
    version: DEFAULT_BRAND.version,
  });

  server.registerTool(
    "verify_email",
    {
      description: "Check one mail address and return a verdict: valid, invalid, risky, or unknown.",
      inputSchema: {
        email: z.string().describe("The mail address to check."),
        adapter: adapterName,
        dryRun: z.boolean().optional().describe("Preview the check without calling a vendor."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ email, adapter, dryRun }) => {
      try {
        const picked: VerifyAdapter =
          adapter === undefined ? fallback : resolveAdapter(adapter as AdapterName);
        return okResult(await verifyEmail(email, { adapter: picked, guards, logger, dryRun: dryRun ?? false }));
      } catch (error) {
        if (error instanceof GuardError || error instanceof VendorError) {
          return errorResult(error);
        }
        throw error;
      }
    },
  );

  server.registerTool(
    "get_cost_report",
    {
      description: "Read the cost report for this session.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => okResult(getCostReport()),
  );

  return server;
}

export async function startMcp(deps: McpDeps = {}): Promise<void> {
  const server = createMcpServer(deps);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
