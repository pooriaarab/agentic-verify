import { VendorError, recordCost, type Guards, type Logger } from "./core.js";

// Email verification. One address goes in, one verdict comes out.
//
// Verdicts:
// - valid: the address looks safe to mail.
// - invalid: do not mail this address.
// - risky: the address may bounce or trap you (catch-all, role).
// - unknown: the vendor gave no firm answer.
//
// An invalid verdict is a result, not an error. The call throws only
// when the check itself fails: a guard denial or a vendor failure.

export type VerifyVerdict = "valid" | "invalid" | "risky" | "unknown";

export interface VerifyDetail {
  email: string;
  verdict: VerifyVerdict;
  reason: string;
  adapter: string;
  raw?: unknown;
}

export interface VerifyAdapter {
  readonly name: string;
  verify(email: string): Promise<VerifyDetail>;
}

export type AdapterName = "local" | "millionverifier" | "zerobounce";

export const ADAPTER_NAMES: AdapterName[] = ["local", "millionverifier", "zerobounce"];

function readEnv(name: string): string | undefined {
  if (typeof process === "undefined" || process.env === undefined) return undefined;
  const value = process.env[name];
  return value === undefined || value.trim().length === 0 ? undefined : value;
}

// Local adapter. The default. It checks the shape of the address in
// memory: no network, no key, no cost. Use it for dry runs and for
// offline syntax checks. It never calls a vendor.

function localReason(email: string): string | null {
  if (email.length === 0) return "empty address";
  if (email.length > 254) return "address runs past 254 chars";
  if (/\s/.test(email)) return "address holds a space";
  const parts = email.split("@");
  if (parts.length !== 2) return "address needs one @";
  const [local, domain] = parts as [string, string];
  if (local.length === 0) return "nothing stands before the @";
  if (local.length > 64) return "name part runs past 64 chars";
  if (local.startsWith(".") || local.endsWith(".")) return "name part may not start or end with a dot";
  if (local.includes("..")) return "name part may not hold two dots in a row";
  if (domain.length === 0) return "nothing stands after the @";
  if (!domain.includes(".")) return "domain lacks a dot";
  if (domain.startsWith(".") || domain.endsWith(".") || domain.startsWith("-") || domain.endsWith("-")) {
    return "domain starts or ends with a bad char";
  }
  for (const label of domain.split(".")) {
    if (label.length === 0) return "domain holds an empty label";
    if (label.length > 63) return "domain label runs past 63 chars";
    if (!/^[a-z0-9-]+$/i.test(label)) return "domain holds a bad char";
    if (label.startsWith("-") || label.endsWith("-")) return "domain label may not start or end with a dash";
  }
  const tld = domain.slice(domain.lastIndexOf(".") + 1);
  if (tld.length < 2) return "top level domain is too short";
  return null;
}

export class LocalVerifyAdapter implements VerifyAdapter {
  readonly name = "local";

  async verify(email: string): Promise<VerifyDetail> {
    const trimmed = email.trim();
    const flaw = localReason(trimmed);
    if (flaw !== null) {
      return {
        email: trimmed,
        verdict: "invalid",
        reason: flaw,
        adapter: this.name,
        raw: { mode: "syntax" },
      };
    }
    return {
      email: trimmed,
      verdict: "valid",
      reason: "shape looks mailable; local check only, no vendor called",
      adapter: this.name,
      raw: { mode: "syntax" },
    };
  }
}

// Shared HTTP helper. Vendor adapters use it so network faults,
// bad status codes, and bad JSON all surface as VendorError.

export interface VendorHttpOptions {
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

async function getJson(
  url: string,
  vendor: string,
  options: VendorHttpOptions,
): Promise<unknown> {
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  let response: Response;
  try {
    response = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new VendorError(`${vendor} request failed: ${String(error)}`, { cause: error });
  }
  if (!response.ok) {
    throw new VendorError(`${vendor} got status ${response.status}`, {
      status: response.status,
    });
  }
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new VendorError(`${vendor} sent bad JSON: ${String(error)}`, { cause: error });
  }
}

// MillionVerifier adapter. Calls the Single API:
// GET https://api.millionverifier.com/api/v3/?api=KEY&email=X&timeout=N
// Docs: https://developer.millionverifier.com

export interface MillionVerifierOptions extends VendorHttpOptions {
  apiKey?: string;
  apiTimeout?: number;
  baseUrl?: string;
}

interface MillionVerifierBody {
  quality?: unknown;
  result?: unknown;
  subresult?: unknown;
  error?: unknown;
}

export class MillionVerifierAdapter implements VerifyAdapter {
  readonly name = "millionverifier";
  private readonly apiKey: string | undefined;
  private readonly apiTimeout: number;
  private readonly baseUrl: string;
  private readonly http: VendorHttpOptions;

  constructor(options: MillionVerifierOptions = {}) {
    this.apiKey = options.apiKey ?? readEnv("MILLIONVERIFIER_API_KEY");
    this.apiTimeout = options.apiTimeout ?? 20;
    this.baseUrl = options.baseUrl ?? "https://api.millionverifier.com/api/v3/";
    this.http = { timeoutMs: options.timeoutMs, fetchFn: options.fetchFn };
  }

  async verify(email: string): Promise<VerifyDetail> {
    const trimmed = email.trim();
    if (trimmed.length === 0) {
      return { email: trimmed, verdict: "invalid", reason: "empty address", adapter: this.name };
    }
    if (this.apiKey === undefined) {
      throw new VendorError(
        "millionverifier needs an API key: pass apiKey or set MILLIONVERIFIER_API_KEY",
      );
    }
    const url =
      `${this.baseUrl}?api=${encodeURIComponent(this.apiKey)}` +
      `&email=${encodeURIComponent(trimmed)}&timeout=${this.apiTimeout}`;
    const body = (await getJson(url, "millionverifier", this.http)) as MillionVerifierBody;
    if (body === null || typeof body !== "object") {
      throw new VendorError("millionverifier sent a bad reply");
    }
    if (typeof body.error === "string" && body.error.length > 0) {
      throw new VendorError(`millionverifier error: ${body.error}`);
    }
    const result = typeof body.result === "string" ? body.result.toLowerCase() : "";
    const sub = typeof body.subresult === "string" && body.subresult.length > 0 ? ` (${body.subresult})` : "";
    switch (result) {
      case "ok":
        return {
          email: trimmed,
          verdict: "valid",
          reason: `vendor reports ok${sub}`,
          adapter: this.name,
          raw: body,
        };
      case "invalid":
        return {
          email: trimmed,
          verdict: "invalid",
          reason: `vendor reports invalid${sub}`,
          adapter: this.name,
          raw: body,
        };
      case "disposable":
        return {
          email: trimmed,
          verdict: "invalid",
          reason: "disposable address, do not mail",
          adapter: this.name,
          raw: body,
        };
      case "catch_all":
        return {
          email: trimmed,
          verdict: "risky",
          reason: "catch-all domain takes mail for any name",
          adapter: this.name,
          raw: body,
        };
      case "unknown":
        return {
          email: trimmed,
          verdict: "unknown",
          reason: `vendor reports unknown${sub}`,
          adapter: this.name,
          raw: body,
        };
      default:
        return {
          email: trimmed,
          verdict: "unknown",
          reason: result.length > 0 ? `vendor sent no firm verdict (${result})` : "vendor sent no verdict",
          adapter: this.name,
          raw: body,
        };
    }
  }
}

// ZeroBounce adapter. Calls the v2 validate API:
// GET https://api.zerobounce.net/v2/validate?api_key=KEY&email=X&ip_address=
// Docs: https://www.zerobounce.net/docs/email-validation-api-quickstart/v2-validate-emails

export interface ZeroBounceOptions extends VendorHttpOptions {
  apiKey?: string;
  ipAddress?: string;
  baseUrl?: string;
}

interface ZeroBounceBody {
  status?: unknown;
  sub_status?: unknown;
  did_you_mean?: unknown;
  error?: unknown;
}

export class ZeroBounceAdapter implements VerifyAdapter {
  readonly name = "zerobounce";
  private readonly apiKey: string | undefined;
  private readonly ipAddress: string;
  private readonly baseUrl: string;
  private readonly http: VendorHttpOptions;

  constructor(options: ZeroBounceOptions = {}) {
    this.apiKey = options.apiKey ?? readEnv("ZEROBOUNCE_API_KEY");
    this.ipAddress = options.ipAddress ?? "";
    this.baseUrl = options.baseUrl ?? "https://api.zerobounce.net/v2/validate";
    this.http = { timeoutMs: options.timeoutMs, fetchFn: options.fetchFn };
  }

  async verify(email: string): Promise<VerifyDetail> {
    const trimmed = email.trim();
    if (trimmed.length === 0) {
      return { email: trimmed, verdict: "invalid", reason: "empty address", adapter: this.name };
    }
    if (this.apiKey === undefined) {
      throw new VendorError(
        "zerobounce needs an API key: pass apiKey or set ZEROBOUNCE_API_KEY",
      );
    }
    const url =
      `${this.baseUrl}?api_key=${encodeURIComponent(this.apiKey)}` +
      `&email=${encodeURIComponent(trimmed)}&ip_address=${encodeURIComponent(this.ipAddress)}`;
    const body = (await getJson(url, "zerobounce", this.http)) as ZeroBounceBody;
    if (body === null || typeof body !== "object") {
      throw new VendorError("zerobounce sent a bad reply");
    }
    if (typeof body.error === "string" && body.error.length > 0) {
      throw new VendorError(`zerobounce error: ${body.error}`);
    }
    const status = typeof body.status === "string" ? body.status.toLowerCase() : "";
    const sub = typeof body.sub_status === "string" && body.sub_status.length > 0 ? ` (${body.sub_status})` : "";
    const hint =
      typeof body.did_you_mean === "string" && body.did_you_mean.length > 0
        ? `, did you mean ${body.did_you_mean}`
        : "";
    switch (status) {
      case "valid":
        return {
          email: trimmed,
          verdict: "valid",
          reason: `vendor reports valid${sub}`,
          adapter: this.name,
          raw: body,
        };
      case "invalid":
        return {
          email: trimmed,
          verdict: "invalid",
          reason: `vendor reports invalid${sub}${hint}`,
          adapter: this.name,
          raw: body,
        };
      case "catch-all":
        return {
          email: trimmed,
          verdict: "risky",
          reason: "catch-all domain takes mail for any name",
          adapter: this.name,
          raw: body,
        };
      case "unknown":
        return {
          email: trimmed,
          verdict: "unknown",
          reason: `vendor reports unknown${sub}`,
          adapter: this.name,
          raw: body,
        };
      case "spamtrap":
        return {
          email: trimmed,
          verdict: "invalid",
          reason: "spamtrap, do not mail",
          adapter: this.name,
          raw: body,
        };
      case "abuse":
        return {
          email: trimmed,
          verdict: "invalid",
          reason: "abuse address, do not mail",
          adapter: this.name,
          raw: body,
        };
      case "do_not_mail":
        return {
          email: trimmed,
          verdict: "invalid",
          reason: `do-not-mail address${sub}, do not mail`,
          adapter: this.name,
          raw: body,
        };
      default:
        return {
          email: trimmed,
          verdict: "unknown",
          reason: status.length > 0 ? `vendor sent no firm verdict (${status})` : "vendor sent no verdict",
          adapter: this.name,
          raw: body,
        };
    }
  }
}

export function resolveAdapter(name: AdapterName | undefined): VerifyAdapter {
  switch (name ?? "local") {
    case "local":
      return new LocalVerifyAdapter();
    case "millionverifier":
      return new MillionVerifierAdapter();
    case "zerobounce":
      return new ZeroBounceAdapter();
    default:
      throw new Error(`unknown adapter "${String(name)}"`);
  }
}

// Verify entry. Runs guards, then checks, then records cost.
// Dry run walks the same path but calls no adapter and records no cost.

export interface VerifyOptions {
  adapter?: VerifyAdapter;
  guards?: Guards;
  logger?: Logger;
  dryRun?: boolean;
}

export interface VerifyResult extends VerifyDetail {
  dryRun: boolean;
}

export function createVerifyDryRun(email: string, adapterName: string): VerifyResult {
  const trimmed = email.trim();
  return {
    dryRun: true,
    email: trimmed,
    verdict: "unknown",
    reason: `dry run: ${adapterName} would check this address, no vendor called`,
    adapter: adapterName,
  };
}

export async function verifyEmail(email: string, options: VerifyOptions = {}): Promise<VerifyResult> {
  const adapter = options.adapter ?? new LocalVerifyAdapter();
  options.guards?.checkDispatch(email);
  if (options.dryRun === true) {
    options.logger?.info(`dry run: would check ${email.trim().length} chars via ${adapter.name}`);
    return createVerifyDryRun(email, adapter.name);
  }
  const detail = await adapter.verify(email);
  options.guards?.recordDispatch();
  recordCost({ kind: "verify", adapter: adapter.name, units: 1 });
  options.logger?.info(`checked ${detail.email} via ${adapter.name}: ${detail.verdict}`);
  return { ...detail, dryRun: false };
}

export async function verifyEmails(emails: string[], options: VerifyOptions = {}): Promise<VerifyResult[]> {
  const results: VerifyResult[] = [];
  for (const email of emails) {
    results.push(await verifyEmail(email, options));
  }
  return results;
}

