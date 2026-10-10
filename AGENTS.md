# agentic-verify agent guide

Check mail addresses before any send.

## Mental model

One address goes in. One verdict comes out. One core serves
all three faces, so each face returns the same shape.

## The three faces

- SDK: `import { verifyEmail } from "agentic-verify"`.
- CLI: `npx agentic-verify verify --email "ada@example.com"`.
- MCP: `npx agentic-verify mcp`, then call a tool below.

Keywords: email-verification, deliverability, agentic-suite, claude-code, codex, cli, mcp.

## MCP tools

| Tool | Use it for |
| --- | --- |
| verify_email | Check one address. Pass adapter and dryRun to steer the run. |
| get_cost_report | Read session cost totals. |

## The loop

1. Discover the tools with `tools/list`.
2. Preview one address with `verify_email` and dryRun true.
3. Run the real check when the preview looks right.
4. Read `get_cost_report` and state the cost.

## Rules

- Preview with dry run before each paid vendor check.
- Stop when a guard denies the call. State the reason.
- Never retry a denied call with a changed address to dodge a guard.
- Report adapter errors as errors. Never present them as success.
- An invalid verdict is a result, not an error. Mail nothing to it.
- State the cost report before you claim the task is done.
