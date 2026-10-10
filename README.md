# Agentic verify

Check mail addresses before any send.

Agentic verify checks one address or a whole list. It returns
a verdict for each address: valid, invalid, risky, or unknown.
It runs as a terminal command, an npm import, or an MCP server.

The default checker runs offline. It reads the shape of the
address and needs no key. Two vendor checkers call
MillionVerifier and ZeroBounce when you pass a key.

## Quick start

You need Node 18 or above.

```sh
npx agentic-verify verify --email "ada@example.com"
```

You see the verdict as JSON:

```json
{"email":"ada@example.com","verdict":"valid","reason":"shape looks mailable; local check only, no vendor called","adapter":"local","raw":{"mode":"syntax"},"dryRun":false}
```

## Three usecases

1. You check one address before you add it to a list.
2. You check a file of addresses before a bulk send.
3. You let an agent check addresses through the MCP server.

## Check one address

```sh
npx agentic-verify verify --email "ada@example.com"
npx agentic-verify verify --email "ada@example.com" --dry-run
```

Dry run previews the check. It calls no vendor and records no cost.

## Check a file

Put one address on each line. Blank lines are skipped.

```sh
npx agentic-verify verify --file ./list.txt
```

## Use a vendor checker

Set one key, then name the checker:

```sh
export MILLIONVERIFIER_API_KEY="your key"
npx agentic-verify verify --email "ada@example.com" --adapter millionverifier
```

```sh
export ZEROBOUNCE_API_KEY="your key"
npx agentic-verify verify --email "ada@example.com" --adapter zerobounce
```

A vendor fault throws and exits 1. An invalid verdict is still
a result, so the command exits 0 and prints the verdict.

## Use the SDK

```js
import { verifyEmail, verifyEmails } from "agentic-verify";

await verifyEmail("ada@example.com");
await verifyEmails(["ada@example.com", "bad-address"]);
await verifyEmail("ada@example.com", { dryRun: true });
```

## Use the MCP server

Start the server:

```sh
npx agentic-verify mcp
```

Call `verify_email` for checks and `get_cost_report` for costs.
`.mcp.json` holds a client config that launches the server.

## Verdicts

- valid: safe to mail.
- invalid: do not mail.
- risky: catch-all or trap prone. Mail with care.
- unknown: no firm answer. Retry or check by hand.

## Costs

Each real check records one cost unit under its adapter name.
Dry runs record nothing. Read the report:

```sh
npx agentic-verify costs
```

## Gates

Run all three before you push:

```sh
npm run build && npm run typecheck && npm test
```

## Layout

- `src/index.ts`: the library face.
- `src/cli.ts`: the terminal face.
- `src/mcp.ts`: the MCP server. `src/mcp-bin.ts` starts it.
- `src/verify.ts`: the checkers.
- `src/worker.ts`: the edge worker face.
- `src/core.ts`: the shared core, from agentic-core.
- `agentic-core.d.ts`: the frozen contract.
- `docs/agentic-core.md`: the contract in plain words.

## License

MIT. See `LICENSE`.
