---
name: agentic-verify
description: Check mail addresses before any send. Keywords: email-verification, deliverability, agentic-suite, claude-code, codex, cli, mcp.
---

# agentic-verify

Check mail addresses before any send.

## Use the SDK

```js
import { verifyEmail } from "agentic-verify";

await verifyEmail("ada@example.com");
await verifyEmail("ada@example.com", { dryRun: true });
```

## Use the CLI

```sh
agentic-verify verify --email "ada@example.com"
agentic-verify verify --file ./list.txt --dry-run
```

## Use the MCP server

Start the server with `agentic-verify mcp`. Call `verify_email`
for checks, `get_cost_report` for costs.

## Rules

- Preview each vendor check with dry run first.
- Report guard denials and adapter errors as failures.
- Read the cost report at the end.
