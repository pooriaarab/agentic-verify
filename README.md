# agentic-verify

[![npm version](https://img.shields.io/npm/v/agentic-verify)](https://www.npmjs.com/package/agentic-verify)
[![Monthly downloads](https://img.shields.io/npm/dm/agentic-verify)](https://www.npmjs.com/package/agentic-verify)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](https://opensource.org/license/mit)

agentic-verify is an open-source email verification adapter for Node.js applications and AI agents, with local syntax checks, MillionVerifier, and ZeroBounce.

## Install

```sh
npm install agentic-verify
```

Requires Node.js 18 or later. Includes TypeScript declarations and three direct runtime dependencies.

## Check your first address

```js
import { verifyEmail } from "agentic-verify";
const result = await verifyEmail("ada@example.com");
console.log(result.adapter, result.verdict, result.raw);
```

Expect `local valid { mode: 'syntax' }`. No API key is required.
This result confirms syntax only; it does not confirm a mailbox exists.

## Features and coverage

- Check one address with `verifyEmail`, or a list sequentially with `verifyEmails`.
- Preview checks with `{ dryRun: true }`; previews call no adapter and record no cost.
- Return `valid`, `invalid`, `risky`, or `unknown` verdicts.

| Adapter | Status | Credentials |
| --- | --- | --- |
| Local | Implemented: syntax only | None |
| MillionVerifier | Implemented: HTTP API | `MILLIONVERIFIER_API_KEY` |
| ZeroBounce | Implemented: HTTP API | `ZEROBOUNCE_API_KEY` |

The registry contains three adapters. Vendor paths have mocked tests; this rewrite includes no live credential checks.
Export keys in your shell, or pass `apiKey` to an adapter constructor. The package does not load `.env` files.

```sh
export MILLIONVERIFIER_API_KEY="your key"
npx agentic-verify verify --email "ada@example.com" --adapter millionverifier --dry-run
npx agentic-verify verify --email "ada@example.com" --adapter millionverifier
```

## Runtime surfaces

The CLI supports `verify --email`, `verify --file`, `costs`, and `mcp`, plus `--help` and `--version`.
Files contain one address per line; blank lines are skipped.
The Model Context Protocol (MCP) server exposes two tools: `verify_email` and `get_cost_report`.
Start it with `npx agentic-verify mcp` or `agentic-verify-mcp`.
The source includes a Worker you deploy, with `GET /health` and `POST /verify` routes.

## Behavior limits

Local checks perform no DNS or mailbox lookup. Vendor verdicts do not guarantee delivery.
Vendor requests default to a 15-second HTTP timeout and have no automatic retries.
A failed batch stops at the first thrown error. Invalid verdicts still return normally.
Each completed check records one usage unit, including local checks; units are not vendor prices.
Costs live in the current process. A separate `costs` invocation cannot read a previous command's usage.

## Links and status

[Package](https://www.npmjs.com/package/agentic-verify) · [Source and support](https://github.com/pooriaarab/agentic-verify)

Version 0.1.0 APIs can change. Public case studies are not yet published.
Run `npm run build`, `npm run typecheck`, and `npm test` before contributing.

## License

MIT.
