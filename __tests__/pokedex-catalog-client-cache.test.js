const fs = require("fs");
const path = require("path");

describe("Pokédex catalog client caching", () => {
  const app = fs.readFileSync(
    path.join(process.cwd(), "pages", "_app.js"),
    "utf8"
  );
  const guard = fs.readFileSync(
    path.join(process.cwd(), "components", "PokedexCatalogFetchGuard.js"),
    "utf8"
  );
  const adminPage = fs.readFileSync(
    path.join(process.cwd(), "pages", "admin", "pokedex.js"),
    "utf8"
  );
  const apiRoute = fs.readFileSync(
    path.join(process.cwd(), "pages", "api", "pokedex-catalog.js"),
    "utf8"
  );
  const overrideApiRoute = fs.readFileSync(
    path.join(
      process.cwd(),
      "pages",
      "api",
      "admin",
      "pokemon-availability-overrides.js"
    ),
    "utf8"
  );

  test("installs a versioned no-store guard before page content", () => {
    expect(app).toContain("<PokedexCatalogFetchGuard />");
    expect(guard).toContain("POKEDEX_CATALOG_CLIENT_VERSION = 4");
    expect(guard).toContain('cache: "no-store"');
    expect(guard).toContain('url.searchParams.set("request", String(Date.now()))');
  });

  test("uses a no-store request on the admin page", () => {
    expect(adminPage).toContain("POKEDEX_CATALOG_CLIENT_VERSION = 4");
    expect(adminPage).toContain('cache: "no-store"');
    expect(adminPage).toContain(
      "/api/admin/pokemon-availability-overrides?request=${Date.now()}"
    );
  });

  test("prevents browser and CDN caching on both API routes", () => {
    for (const source of [apiRoute, overrideApiRoute]) {
      expect(source).toContain("no-store, no-cache, must-revalidate");
      expect(source).toContain(
        'res.setHeader("CDN-Cache-Control", "no-store")'
      );
    }
  });
});
