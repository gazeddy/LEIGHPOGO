const fs = require("fs")
const path = require("path")

describe("self-service account deletion safeguards", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "pages", "api", "account.js"),
    "utf8",
  )

  it("takes the account identity from the authenticated session", () => {
    expect(source).toContain("const ownerId = Number(session?.user?.id)")
    expect(source).toContain("where: { id: ownerId }")
  })

  it("requires explicit destructive confirmation and credential verification", () => {
    expect(source).toContain('const DELETE_CONFIRMATION = "DELETE"')
    expect(source).toContain("bcrypt.compare")
  })

  it("cleans account-linked data and revokes old sessions", () => {
    expect(source).toContain("removeStoredPokedexImport(job.id)")
    expect(source).toContain("tx.privacyAcceptance.deleteMany")
    expect(source).toContain("tx.usageEvent.deleteMany")
    expect(source).toContain("tx.user.delete")
    expect(source).toContain("tx.accountRevocation.upsert")
    expect(source).toContain("Max-Age=0")
  })
})
