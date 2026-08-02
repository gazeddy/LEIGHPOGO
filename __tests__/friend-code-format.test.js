const fs = require("fs")
const path = require("path")
const {
  canonicalFriendCode,
  formatFriendCode,
  formatFriendCodeInput,
  normalizeFriendCode,
} = require("../lib/friendCode")

describe("friend code formatting", () => {
  it("formats typing into three blocks of four digits", () => {
    expect(formatFriendCodeInput("123456789012")).toBe("1234 5678 9012")
    expect(formatFriendCodeInput("1234-5678-9012")).toBe("1234 5678 9012")
    expect(formatFriendCodeInput("12345")).toBe("1234 5")
  })

  it("limits form input to 12 digits", () => {
    expect(formatFriendCodeInput("1234567890129999")).toBe("1234 5678 9012")
  })

  it("normalizes valid codes and rejects malformed values", () => {
    expect(normalizeFriendCode("1234 5678 9012")).toBe("123456789012")
    expect(formatFriendCode("1234.5678.9012")).toBe("1234 5678 9012")
    expect(canonicalFriendCode("1234-5678-9012")).toBe("1234 5678 9012")
    expect(canonicalFriendCode("1234 5678")).toBeNull()
    expect(canonicalFriendCode("1234567890123")).toBeNull()
  })

  it("enforces canonical storage in every friend-code write API", () => {
    const files = [
      "pages/api/entries.js",
      "pages/api/account.js",
      "pages/api/entries/[id].js",
      "pages/api/admin/entries/[id].js",
    ]

    for (const file of files) {
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf8")
      expect(source).toContain("canonicalFriendCode")
    }
  })

  it("includes a migration for legacy database rows", () => {
    const migration = fs.readFileSync(
      path.join(
        process.cwd(),
        "prisma/migrations/20260802123000_normalize_friend_codes/migration.sql",
      ),
      "utf8",
    )

    expect(migration).toContain("WITH RECURSIVE")
    expect(migration).toContain("length(\"digits\") = 12")
    expect(migration).toContain("UPDATE \"Entry\"")
  })
})
