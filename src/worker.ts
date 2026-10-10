import { VendorError } from "./core.js";
import {
  LocalVerifyAdapter,
  MillionVerifierAdapter,
  ZeroBounceAdapter,
  verifyEmail,
  verifyEmails,
} from "./verify.js";
import { VERSION } from "./version.js";

export interface WorkerEnv {
  PACK_NAME?: string;
  MILLIONVERIFIER_API_KEY?: string;
  ZEROBOUNCE_API_KEY?: string;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function pickAdapter(name: unknown, env: WorkerEnv) {
  if (name === undefined || name === "local") return new LocalVerifyAdapter();
  if (name === "millionverifier") {
    return new MillionVerifierAdapter({ apiKey: env.MILLIONVERIFIER_API_KEY });
  }
  if (name === "zerobounce") {
    return new ZeroBounceAdapter({ apiKey: env.ZEROBOUNCE_API_KEY });
  }
  return null;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, pack: env.PACK_NAME ?? "agentic-verify", version: VERSION });
    }
    if (request.method === "POST" && url.pathname === "/verify") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "body must be JSON" }, 400);
      }
      if (typeof body !== "object" || body === null) {
        return json({ error: "body needs an email string or an emails array" }, 400);
      }
      const { email, emails, adapter, dryRun } = body as {
        email?: unknown;
        emails?: unknown;
        adapter?: unknown;
        dryRun?: unknown;
      };
      const picked = pickAdapter(adapter, env);
      if (picked === null) {
        return json({ error: "adapter must be one of local, millionverifier, zerobounce" }, 400);
      }
      const options = { adapter: picked, dryRun: dryRun === true };
      try {
        if (typeof email === "string") {
          return json(await verifyEmail(email, options));
        }
        if (Array.isArray(emails) && emails.every((item) => typeof item === "string")) {
          return json(await verifyEmails(emails as string[], options));
        }
        return json({ error: "body needs an email string or an emails array" }, 400);
      } catch (error) {
        if (error instanceof VendorError) {
          return json({ error: error.message }, 502);
        }
        throw error;
      }
    }
    return json({ error: "not found" }, 404);
  },
};
