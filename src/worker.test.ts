import { describe, expect, test } from "vitest";
import worker from "./worker.js";

function post(path: string, body: unknown) {
  return new Request(`https://pack.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("worker", () => {
  test("GET /health reports ok", async () => {
    const response = await worker.fetch(new Request("https://pack.test/health"), {
      PACK_NAME: "probe",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, pack: "probe" });
  });

  test("POST /verify checks one address", async () => {
    const response = await worker.fetch(post("/verify", { email: "ada@example.com" }), {});
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ verdict: "valid", adapter: "local" });
  });

  test("POST /verify checks a list", async () => {
    const response = await worker.fetch(
      post("/verify", { emails: ["ada@example.com", "bad"] }),
      {},
    );
    expect(response.status).toBe(200);
    const results = (await response.json()) as { verdict: string }[];
    expect(results.map((r) => r.verdict)).toEqual(["valid", "invalid"]);
  });

  test("POST /verify dry run previews", async () => {
    const response = await worker.fetch(
      post("/verify", { email: "ada@example.com", dryRun: true }),
      {},
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ dryRun: true, verdict: "unknown" });
  });

  test("POST /verify rejects a bad body", async () => {
    const response = await worker.fetch(post("/verify", { email: 42 }), {});
    expect(response.status).toBe(400);
  });

  test("POST /verify rejects a bad adapter name", async () => {
    const response = await worker.fetch(post("/verify", { email: "a@b.com", adapter: "nope" }), {});
    expect(response.status).toBe(400);
  });

  test("POST /verify maps a vendor fault to 502", async () => {
    const saved = process.env.MILLIONVERIFIER_API_KEY;
    delete process.env.MILLIONVERIFIER_API_KEY;
    try {
      const response = await worker.fetch(
        post("/verify", { email: "a@b.com", adapter: "millionverifier" }),
        {},
      );
      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({ error: expect.stringContaining("API key") });
    } finally {
      if (saved !== undefined) process.env.MILLIONVERIFIER_API_KEY = saved;
    }
  });

  test("unknown routes return 404", async () => {
    const response = await worker.fetch(new Request("https://pack.test/nowhere"), {});
    expect(response.status).toBe(404);
  });
});
