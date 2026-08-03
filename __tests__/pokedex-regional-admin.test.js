const fs = require("fs")
const path = require("path")

const read = (...parts) =>
  fs.readFileSync(path.join(process.cwd(), ...parts), "utf8")

describe("Pokédex regional administration", () => {
  const app = read("pages", "_app.js")
  const regionalAdmin = read("components", "admin", "PokemonRegionalAdmin.js")
  const regionalApi = read(
    "pages",
    "api",
    "admin",
    "pokemon-regional-overrides.js"
  )
  const schema = read("prisma", "schema.prisma")
  const migration = read(
    "prisma",
    "migrations",
    "20260803155000_add_pokemon_regional_overrides",
    "migration.sql"
  )

  test("shows regional controls only on the Pokédex admin page", () => {
    expect(app).toContain('router.pathname === "/admin/pokedex"')
    expect(app).toContain("<PokemonRegionalAdmin />")
    expect(regionalAdmin).toContain("Regional status")
    expect(regionalAdmin).toContain("Primary lock area(s)")
    expect(regionalAdmin).toContain("multiple")
    expect(regionalAdmin).toContain("Custom locations")
    expect(regionalAdmin).toContain("Regional first")
  })

  test("stores regional metadata independently from release overrides", () => {
    expect(schema).toContain("model PokemonRegionalOverride")
    expect(schema).toContain("isRegional Boolean")
    expect(schema).toContain("regions    String?")
    expect(migration).toContain('CREATE TABLE "PokemonRegionalOverride"')
    expect(regionalAdmin).toContain("/api/admin/pokemon-regional-overrides")
  })

  test("keeps the regional endpoint admin-only and uncached", () => {
    expect(regionalApi).toContain('session?.user?.role === "admin"')
    expect(regionalApi).toContain("no-store, no-cache, must-revalidate")
    expect(regionalApi).toContain('res.setHeader("CDN-Cache-Control", "no-store")')
  })
})
