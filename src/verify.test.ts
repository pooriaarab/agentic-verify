import { describe, expect, test, beforeEach, afterEach } from "vitest";
import {
  createGuards,
  getCostReport,
  GuardError,
  resetCosts,
  VendorError,
} from "./core.js";
import {
  LocalVerifyAdapter,
  MillionVerifierAdapter,
  ZeroBounceAdapter,
  resolveAdapter,
  verifyEmail,
  verifyEmails,
  type VerifyAdapter,
  type VerifyDetail,
} from "./verify.js";

const SAVED_MV = process.env.MILLIONVERIFIER_API_KEY;
const SAVED_ZB = process.env.ZEROBOUNCE_API_KEY;

beforeEach(() => {
  resetCosts();
  delete process.env.MILLIONVERIFIER_API_KEY;
  delete process.env.ZEROBOUNCE_API_KEY;
});

afterEach(() => {
  if (SAVED_MV !== undefined) process.env.MILLIONVERIFIER_API_KEY = SAVED_MV;
  if (SAVED_ZB !== undefined) process.env.ZEROBOUNCE_API_KEY = SAVED_ZB;
});

function stubFetch(body: unknown, status = 200, seen?: { url: string }): typeof fetch {
  const fn = async (input: unknown) => {
    if (seen !== undefined) seen.url = String(input);
    return new Response(JSON.stringify(body), { status });
  };
  return fn as unknown as typeof fetch;
}

function countingAdapter(detail?: Partial<VerifyDetail>): VerifyAdapter & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    name: "count",
    verify: async (email: string) => {
      calls.push(email);
      return {
        email,
        verdict: "valid",
        reason: "counted",
        adapter: "count",
        ...detail,
      };
    },
  };
}

describe("LocalVerifyAdapter", () => {
  test("accepts a plain address", async () => {
    const detail = await new LocalVerifyAdapter().verify("ada@example.com");
    expect(detail).toMatchObject({ verdict: "valid", adapter: "local" });
  });

  test("trims edge spaces then accepts", async () => {
    const detail = await new LocalVerifyAdapter().verify("  ada@example.com\n");
    expect(detail).toMatchObject({ email: "ada@example.com", verdict: "valid" });
  });

  test.each([
    ["", "empty address"],
    ["no-at-sign", "address needs one @"],
    ["a@b@c.com", "address needs one @"],
    ["a b@c.com", "address holds a space"],
    ["@c.com", "nothing stands before the @"],
    ["a@", "nothing stands after the @"],
    ["a@nodot", "domain lacks a dot"],
    [".a@c.com", "name part may not start or end with a dot"],
    ["a..b@c.com", "name part may not hold two dots in a row"],
    ["a@c..com", "domain holds an empty label"],
    ["a@c.c", "top level domain is too short"],
  ])("rejects %s (%s)", async (email, reason) => {
    const detail = await new LocalVerifyAdapter().verify(email);
    expect(detail.verdict).toBe("invalid");
    expect(detail.reason).toBe(reason);
  });

  test("rejects an overlong address", async () => {
    const detail = await new LocalVerifyAdapter().verify(`a@${"b".repeat(250)}.com`);
    expect(detail.verdict).toBe("invalid");
  });
});

describe("resolveAdapter", () => {
  test("defaults to local", () => {
    expect(resolveAdapter(undefined).name).toBe("local");
  });

  test("names each vendor", () => {
    expect(resolveAdapter("millionverifier").name).toBe("millionverifier");
    expect(resolveAdapter("zerobounce").name).toBe("zerobounce");
  });

  test("throws on an unknown name", () => {
    expect(() => resolveAdapter("nope" as never)).toThrow("unknown adapter");
  });
});

describe("MillionVerifierAdapter", () => {
  test.each([
    ["ok", "valid"],
    ["invalid", "invalid"],
    ["disposable", "invalid"],
    ["catch_all", "risky"],
    ["unknown", "unknown"],
  ])("maps result %s to %s", async (result, verdict) => {
    const adapter = new MillionVerifierAdapter({
      apiKey: "k",
      fetchFn: stubFetch({ result, subresult: "", error: "" }),
    });
    const detail = await adapter.verify("a@b.com");
    expect(detail.verdict).toBe(verdict);
    expect(detail.adapter).toBe("millionverifier");
  });

  test("sends api, email, and timeout params", async () => {
    const seen = { url: "" };
    const adapter = new MillionVerifierAdapter({
      apiKey: "k",
      apiTimeout: 10,
      fetchFn: stubFetch({ result: "ok", error: "" }, 200, seen),
    });
    await adapter.verify("a@b.com");
    expect(seen.url).toContain("https://api.millionverifier.com/api/v3/");
    expect(seen.url).toContain("api=k");
    expect(seen.url).toContain("email=a%40b.com");
    expect(seen.url).toContain("timeout=10");
  });

  test("throws when the key is missing", async () => {
    const adapter = new MillionVerifierAdapter({ fetchFn: stubFetch({}) });
    await expect(adapter.verify("a@b.com")).rejects.toBeInstanceOf(VendorError);
  });

  test("reads the key from the env", async () => {
    process.env.MILLIONVERIFIER_API_KEY = "env-key";
    const seen = { url: "" };
    const adapter = new MillionVerifierAdapter({ fetchFn: stubFetch({ result: "ok" }, 200, seen) });
    await adapter.verify("a@b.com");
    expect(seen.url).toContain("api=env-key");
  });

  test("throws on a vendor error field", async () => {
    const adapter = new MillionVerifierAdapter({
      apiKey: "k",
      fetchFn: stubFetch({ error: "bad key" }),
    });
    await expect(adapter.verify("a@b.com")).rejects.toThrow("bad key");
  });

  test("throws on a bad status with the status kept", async () => {
    const adapter = new MillionVerifierAdapter({
      apiKey: "k",
      fetchFn: stubFetch({}, 500),
    });
    const error = (await adapter.verify("a@b.com").catch((e: unknown) => e)) as VendorError;
    expect(error).toBeInstanceOf(VendorError);
    expect(error.status).toBe(500);
  });

  test("throws on a network fault", async () => {
    const fail = (async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    const adapter = new MillionVerifierAdapter({ apiKey: "k", fetchFn: fail });
    await expect(adapter.verify("a@b.com")).rejects.toThrow("boom");
  });

  test("returns invalid for an empty address without a key or a call", async () => {
    let calls = 0;
    const spy = (async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const detail = await new MillionVerifierAdapter({ fetchFn: spy }).verify("  ");
    expect(detail.verdict).toBe("invalid");
    expect(calls).toBe(0);
  });
});

describe("ZeroBounceAdapter", () => {
  test.each([
    ["valid", "valid"],
    ["invalid", "invalid"],
    ["catch-all", "risky"],
    ["unknown", "unknown"],
    ["spamtrap", "invalid"],
    ["abuse", "invalid"],
    ["do_not_mail", "invalid"],
  ])("maps status %s to %s", async (status, verdict) => {
    const adapter = new ZeroBounceAdapter({
      apiKey: "k",
      fetchFn: stubFetch({ status, sub_status: "" }),
    });
    const detail = await adapter.verify("a@b.com");
    expect(detail.verdict).toBe(verdict);
    expect(detail.adapter).toBe("zerobounce");
  });

  test("adds sub status and hint to the reason", async () => {
    const adapter = new ZeroBounceAdapter({
      apiKey: "k",
      fetchFn: stubFetch({ status: "invalid", sub_status: "mailbox_not_found", did_you_mean: "a@b.co" }),
    });
    const detail = await adapter.verify("a@b.com");
    expect(detail.reason).toContain("mailbox_not_found");
    expect(detail.reason).toContain("a@b.co");
  });

  test("sends api_key, email, and ip_address params", async () => {
    const seen = { url: "" };
    const adapter = new ZeroBounceAdapter({
      apiKey: "k",
      ipAddress: "1.2.3.4",
      fetchFn: stubFetch({ status: "valid" }, 200, seen),
    });
    await adapter.verify("a@b.com");
    expect(seen.url).toContain("https://api.zerobounce.net/v2/validate");
    expect(seen.url).toContain("api_key=k");
    expect(seen.url).toContain("email=a%40b.com");
    expect(seen.url).toContain("ip_address=1.2.3.4");
  });

  test("throws when the key is missing", async () => {
    const adapter = new ZeroBounceAdapter({ fetchFn: stubFetch({}) });
    await expect(adapter.verify("a@b.com")).rejects.toBeInstanceOf(VendorError);
  });

  test("throws on a vendor error field", async () => {
    const adapter = new ZeroBounceAdapter({
      apiKey: "k",
      fetchFn: stubFetch({ error: "no credits" }),
    });
    await expect(adapter.verify("a@b.com")).rejects.toThrow("no credits");
  });

  test("throws on a bad status with the status kept", async () => {
    const adapter = new ZeroBounceAdapter({
      apiKey: "k",
      fetchFn: stubFetch({}, 503),
    });
    const error = (await adapter.verify("a@b.com").catch((e: unknown) => e)) as VendorError;
    expect(error).toBeInstanceOf(VendorError);
    expect(error.status).toBe(503);
  });

  test("throws on a network fault", async () => {
    const fail = (async () => {
      throw new Error("down");
    }) as unknown as typeof fetch;
    const adapter = new ZeroBounceAdapter({ apiKey: "k", fetchFn: fail });
    await expect(adapter.verify("a@b.com")).rejects.toThrow("down");
  });
});

describe("verifyEmail", () => {
  test("dry run calls no adapter and records no cost", async () => {
    const adapter = countingAdapter();
    const result = await verifyEmail("a@b.com", { adapter, dryRun: true });
    expect(result).toMatchObject({ dryRun: true, verdict: "unknown", adapter: "count" });
    expect(adapter.calls).toEqual([]);
    expect(getCostReport().entries).toEqual([]);
  });

  test("a real check records one cost unit", async () => {
    const result = await verifyEmail("a@b.com", { adapter: countingAdapter() });
    expect(result.dryRun).toBe(false);
    expect(getCostReport().entries).toEqual([
      expect.objectContaining({ kind: "verify", adapter: "count", units: 1 }),
    ]);
  });

  test("a denied guard throws and records no cost", async () => {
    const adapter = countingAdapter();
    const guards = createGuards({ caps: { maxDispatches: 0 } });
    await expect(verifyEmail("a@b.com", { adapter, guards })).rejects.toBeInstanceOf(GuardError);
    expect(adapter.calls).toEqual([]);
    expect(getCostReport().entries).toEqual([]);
  });

  test("a blocklisted term throws", async () => {
    const guards = createGuards({ blocklist: ["banned"] });
    await expect(verifyEmail("a@banned.com", { guards })).rejects.toThrow("blocklisted");
  });

  test("a vendor failure throws and records no cost", async () => {
    const fail: VerifyAdapter = {
      name: "fail",
      verify: async () => {
        throw new VendorError("vendor down");
      },
    };
    await expect(verifyEmail("a@b.com", { adapter: fail })).rejects.toThrow("vendor down");
    expect(getCostReport().entries).toEqual([]);
  });
});

describe("verifyEmails", () => {
  test("checks each address in order", async () => {
    const adapter = countingAdapter();
    const results = await verifyEmails(["a@b.com", "bad"], { adapter });
    expect(results).toHaveLength(2);
    expect(adapter.calls).toEqual(["a@b.com", "bad"]);
    expect(getCostReport().units).toBe(2);
  });

  test("an empty list returns an empty list", async () => {
    await expect(verifyEmails([], { adapter: countingAdapter() })).resolves.toEqual([]);
  });
});
