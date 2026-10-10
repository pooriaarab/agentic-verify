# agentic-verify rules

These rules bind every run of agentic-verify. They also bind
agents that drive this pack over MCP.

1. Preview before you act. Run each vendor check with dry run first.
2. Respect guards. A denied call stays denied.
3. Report failures as failures. Adapters throw, and callers surface
   the error. No silent success follows a failed call.
4. Count the cost. Read the cost report before you close a task.
5. Keep quiet hours. The pack refuses checks inside the window.
6. Honor verdicts. Never mail an address with an invalid verdict.

Pack: Check mail addresses before any send. Keywords: email-verification, deliverability, agentic-suite, claude-code, codex, cli, mcp.
