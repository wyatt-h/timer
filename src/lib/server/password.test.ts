import { describe, expect, it } from "vitest";
import { hashSecret, verifyAgainstDecoy, verifySecret } from "@/lib/server/password";

/*
 * scrypt with a per-secret salt and a self-describing serialised format. These
 * tests deliberately use short passwords: the length rules are enforced by the
 * route handlers, and this module's job is only to hash whatever it is given.
 */
describe("password hashing", () => {
  it("never stores the secret, and never stores the same hash twice", async () => {
    const first = await hashSecret("correct horse battery");
    const second = await hashSecret("correct horse battery");

    expect(first).not.toContain("correct horse battery");
    // Different random salts, so the same password hashes differently.
    expect(first).not.toBe(second);
    expect(await verifySecret("correct horse battery", first)).toBe(true);
    expect(await verifySecret("correct horse battery", second)).toBe(true);
  });

  it("carries its own parameters so the cost can be raised later", async () => {
    const [scheme, cost, blockSize, parallelization, keyLength, salt, hash] = (
      await hashSecret("a-password")
    ).split("$");

    expect(scheme).toBe("scrypt");
    expect(Number(cost)).toBeGreaterThanOrEqual(16_384);
    expect(Number(blockSize)).toBe(8);
    expect(Number(parallelization)).toBe(1);
    expect(Number(keyLength)).toBe(64);
    expect(Buffer.from(salt, "base64url")).toHaveLength(16);
    expect(Buffer.from(hash, "base64url")).toHaveLength(64);
  });

  it("verifies a hash written with parameters other than today's", async () => {
    // Stands in for a hash written before the cost was raised. The parameters
    // travel with the hash, so it must still verify.
    const { scryptSync } = await import("node:crypto");
    const salt = Buffer.from("sixteen-byte-slt");
    const key = scryptSync("legacy-password", salt, 32, { N: 1024, r: 8, p: 1 });
    const stored = [
      "scrypt",
      1024,
      8,
      1,
      32,
      salt.toString("base64url"),
      key.toString("base64url"),
    ].join("$");

    expect(await verifySecret("legacy-password", stored)).toBe(true);
    expect(await verifySecret("other-password", stored)).toBe(false);
  });

  it("rejects a wrong password", async () => {
    const stored = await hashSecret("the-right-one");
    expect(await verifySecret("the-wrong-one", stored)).toBe(false);
    expect(await verifySecret("", stored)).toBe(false);
    // A near miss is no closer than a total miss.
    expect(await verifySecret("the-right-on", stored)).toBe(false);
    expect(await verifySecret("the-right-onE", stored)).toBe(false);
  });

  it("distinguishes secrets that differ only in whitespace", async () => {
    const stored = await hashSecret(" padded password ");
    expect(await verifySecret("padded password", stored)).toBe(false);
    expect(await verifySecret(" padded password ", stored)).toBe(true);
  });

  it("treats a malformed stored hash as a failed check, not a crash", async () => {
    for (const stored of [
      "",
      "not-a-hash",
      "scrypt$16384$8$1$64$only-five-parts",
      "bcrypt$16384$8$1$64$c2FsdA$aGFzaA",
      "scrypt$0$8$1$64$c2FsdA$aGFzaA",
      "scrypt$16384$8$1$64$$aGFzaA",
    ]) {
      await expect(verifySecret("anything", stored)).resolves.toBe(false);
    }
  });

  it("spends real work on an unknown login name so timing says nothing", async () => {
    const started = performance.now();
    expect(await verifyAgainstDecoy("some-password")).toBe(false);
    const decoyCost = performance.now() - started;

    const stored = await hashSecret("some-password");
    const realStarted = performance.now();
    await verifySecret("wrong-password", stored);
    const realCost = performance.now() - realStarted;

    /*
     * Both paths run one scrypt derivation at the same cost. The bound is loose
     * because a shared CI machine is noisy; the point is that the unknown-user
     * path is not orders of magnitude cheaper, which is what would leak.
     */
    expect(decoyCost).toBeGreaterThan(realCost / 20);
  });
});
