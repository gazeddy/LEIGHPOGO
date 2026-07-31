const {
  HASH_CACHE_TTL_MS,
  isHashCacheFresh,
  normaliseHashManifest,
  selectPreferredHash,
} = require("../../lib/pogoApiHashCache");

function hashEntry(filename, index) {
  return {
    api_filename: filename,
    full_path: `/api/v1/${filename}`,
    hash_md5: `md5-${index}`,
    hash_sha1: `sha1-${index}`,
    hash_sha256: `sha256-${index}`,
  };
}

describe("PoGoAPI hash manifest helpers", () => {
  it("stores every valid API hash entry from the manifest", () => {
    const payload = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => {
        const filename = `api-${index}.json`;
        return [filename, hashEntry(filename, index)];
      }),
    );

    const manifest = normaliseHashManifest(payload);

    expect(Object.keys(manifest)).toHaveLength(12);
    expect(manifest["api-4.json"]).toEqual(hashEntry("api-4.json", 4));
  });

  it("prefers SHA-256, then SHA-1, then MD5", () => {
    expect(
      selectPreferredHash({
        hash_sha256: "sha256",
        hash_sha1: "sha1",
        hash_md5: "md5",
      }),
    ).toBe("sha256");
    expect(
      selectPreferredHash({
        hash_sha256: null,
        hash_sha1: "sha1",
        hash_md5: "md5",
      }),
    ).toBe("sha1");
    expect(
      selectPreferredHash({
        hash_sha256: null,
        hash_sha1: null,
        hash_md5: "md5",
      }),
    ).toBe("md5");
  });

  it("checks the manifest once per day", () => {
    const now = Date.parse("2026-07-31T12:00:00.000Z");

    expect(
      isHashCacheFresh(
        { checkedAt: new Date(now - HASH_CACHE_TTL_MS + 1_000).toISOString() },
        HASH_CACHE_TTL_MS,
        now,
      ),
    ).toBe(true);
    expect(
      isHashCacheFresh(
        { checkedAt: new Date(now - HASH_CACHE_TTL_MS - 1_000).toISOString() },
        HASH_CACHE_TTL_MS,
        now,
      ),
    ).toBe(false);
  });
});
