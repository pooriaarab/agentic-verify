import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, test } from "vitest";
import { createGuards, VendorError } from "./core.js";
import { createMcpServer } from "./mcp.js";
import type { VerifyAdapter } from "./verify.js";

function textOf(result: unknown): string {
  const content = (result as { content: { type: string; text: string }[] }).content;
  return content[0].text;
}

async function linked(deps: Parameters<typeof createMcpServer>[0] = {}) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer(deps);
  await server.connect(serverTransport);
  const client = new Client({ name: "probe", version: "0.0.0" });
  await client.connect(clientTransport);
  return { client, server };
}

describe("mcp server", () => {
  test("serves verify_email and get_cost_report over a client link", async () => {
    const { client, server } = await linked();
    try {
      const tools = await client.listTools();
      const names = tools.tools.map((tool) => tool.name).sort();
      expect(names).toEqual(["get_cost_report", "verify_email"]);

      const checked = await client.callTool({
        name: "verify_email",
        arguments: { email: "ada@example.com" },
      });
      expect(JSON.parse(textOf(checked))).toMatchObject({ verdict: "valid", adapter: "local" });

      const bad = await client.callTool({
        name: "verify_email",
        arguments: { email: "no-at-sign" },
      });
      expect(JSON.parse(textOf(bad))).toMatchObject({ verdict: "invalid" });

      const preview = await client.callTool({
        name: "verify_email",
        arguments: { email: "ada@example.com", dryRun: true },
      });
      expect(JSON.parse(textOf(preview))).toMatchObject({ dryRun: true, verdict: "unknown" });

      const report = await client.callTool({ name: "get_cost_report", arguments: {} });
      expect(JSON.parse(textOf(report))).toHaveProperty("entries");
    } finally {
      await client.close();
      await server.close();
    }
  });

  test("a blocked check returns a tool error, not a crash", async () => {
    const { client, server } = await linked({ guards: createGuards({ blocklist: ["nope"] }) });
    try {
      const result = await client.callTool({
        name: "verify_email",
        arguments: { email: "a@nope.com" },
      });
      expect((result as { isError?: boolean }).isError).toBe(true);
      expect(textOf(result)).toContain("blocklisted");
    } finally {
      await client.close();
      await server.close();
    }
  });

  test("a vendor failure returns a tool error, not a crash", async () => {
    const fail: VerifyAdapter = {
      name: "fail",
      verify: async () => {
        throw new VendorError("vendor down");
      },
    };
    const { client, server } = await linked({ adapter: fail });
    try {
      const result = await client.callTool({
        name: "verify_email",
        arguments: { email: "ada@example.com" },
      });
      expect((result as { isError?: boolean }).isError).toBe(true);
      expect(textOf(result)).toContain("vendor down");
    } finally {
      await client.close();
      await server.close();
    }
  });
});
