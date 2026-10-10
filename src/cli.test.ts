import { describe, expect, test } from "vitest";
import { parseArgs, runCli, UsageError, type CliIo } from "./cli.js";
import { VendorError } from "./core.js";
import type { VerifyAdapter } from "./verify.js";

function stubAdapter(verdict = "valid"): VerifyAdapter {
  return {
    name: "stub",
    verify: async (email: string) => ({
      email,
      verdict: verdict as "valid",
      reason: "stub says so",
      adapter: "stub",
    }),
  };
}

function makeIo(overrides: Partial<CliIo> = {}): CliIo & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return {
    outLines,
    errLines,
    out: (line) => outLines.push(line),
    err: (line) => errLines.push(line),
    readFile: () => "",
    adapter: stubAdapter(),
    ...overrides,
  };
}

describe("parseArgs", () => {
  test("verify takes an email", () => {
    expect(parseArgs(["verify", "--email", "a@b.com"])).toMatchObject({
      command: "verify",
      email: "a@b.com",
      dryRun: false,
    });
  });

  test("verify takes a file, an adapter, and dry run", () => {
    expect(parseArgs(["verify", "--file", "list.txt", "--adapter", "zerobounce", "--dry-run"])).toMatchObject(
      {
        command: "verify",
        file: "list.txt",
        adapter: "zerobounce",
        dryRun: true,
      },
    );
  });

  test("verify needs an email or a file", () => {
    expect(() => parseArgs(["verify"])).toThrow("verify needs --email or --file");
  });

  test("adapter names come from a fixed set", () => {
    expect(() => parseArgs(["verify", "--email", "a@b.com", "--adapter", "nope"])).toThrow(
      "--adapter needs one of",
    );
  });

  test("email flag on costs throws", () => {
    expect(() => parseArgs(["costs", "--email", "a@b.com"])).toThrow('unknown flag "--email"');
  });

  test("unknown command throws", () => {
    expect(() => parseArgs(["send"])).toThrow('unknown command "send"');
  });

  test("help and version flags map", () => {
    expect(parseArgs([]).command).toBe("help");
    expect(parseArgs(["--help"]).command).toBe("help");
    expect(parseArgs(["--version"]).command).toBe("version");
  });
});

describe("runCli", () => {
  test("help prints usage and exits 0", async () => {
    const io = makeIo();
    await expect(runCli([], io)).resolves.toBe(0);
    expect(io.outLines.join("\n")).toContain("verify --email");
  });

  test("version prints a semver line", async () => {
    const io = makeIo();
    await expect(runCli(["--version"], io)).resolves.toBe(0);
    expect(io.outLines[0]).toMatch(/^\d+\.\d+\.\d+/);
  });

  test("verify prints one verdict", async () => {
    const io = makeIo();
    await expect(runCli(["verify", "--email", "a@b.com"], io)).resolves.toBe(0);
    expect(JSON.parse(io.outLines[0] as string)).toMatchObject({
      email: "a@b.com",
      verdict: "valid",
      dryRun: false,
    });
  });

  test("verify skips blank lines in a file", async () => {
    const io = makeIo({ readFile: () => "a@b.com\n\n  \nc@d.com\n" });
    await expect(runCli(["verify", "--file", "list.txt"], io)).resolves.toBe(0);
    const results = JSON.parse(io.outLines[0] as string) as { email: string }[];
    expect(results.map((r) => r.email)).toEqual(["a@b.com", "c@d.com"]);
  });

  test("dry run previews without a real check", async () => {
    const io = makeIo();
    await expect(runCli(["verify", "--email", "a@b.com", "--dry-run"], io)).resolves.toBe(0);
    expect(JSON.parse(io.outLines[0] as string)).toMatchObject({ dryRun: true, verdict: "unknown" });
  });

  test("a vendor failure prints the error and exits 1", async () => {
    const fail: VerifyAdapter = {
      name: "fail",
      verify: async () => {
        throw new VendorError("vendor down");
      },
    };
    const io = makeIo({ adapter: fail });
    await expect(runCli(["verify", "--email", "a@b.com"], io)).resolves.toBe(1);
    expect(io.errLines.join("\n")).toContain("VendorError: vendor down");
  });

  test("a missing file prints the path and exits 1", async () => {
    const io = makeIo({
      readFile: () => {
        throw Object.assign(new Error("no"), { code: "ENOENT" });
      },
    });
    await expect(runCli(["verify", "--file", "gone.txt"], io)).resolves.toBe(1);
    expect(io.errLines.join("\n")).toContain("file not found: gone.txt");
  });

  test("bad usage exits 2 with a hint", async () => {
    const io = makeIo();
    await expect(runCli(["verify"], io)).resolves.toBe(2);
    expect(io.errLines.join("\n")).toContain("--help");
  });

  test("UsageError carries its name", () => {
    expect(new UsageError("x").name).toBe("UsageError");
  });
});
