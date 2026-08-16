const fs = require("fs")
const path = require("path")

describe("PWA foundation", () => {
  it("provides an installable standalone manifest with app shortcuts", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "public/manifest.webmanifest"), "utf8"),
    )

    expect(manifest.id).toBe("/")
    expect(manifest.start_url).toBe("/")
    expect(manifest.scope).toBe("/")
    expect(manifest.display).toBe("standalone")
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: "/pwa-icon.svg",
          sizes: "any",
          purpose: expect.stringContaining("maskable"),
        }),
      ]),
    )
    expect(manifest.shortcuts.map((shortcut) => shortcut.url)).toEqual(
      expect.arrayContaining(["/friend-codes", "/gyms", "/trades"]),
    )
  })

  it("uses an offline fallback without caching authenticated or API data", () => {
    const serviceWorker = fs.readFileSync(
      path.join(process.cwd(), "public/sw.js"),
      "utf8",
    )

    expect(serviceWorker).toContain('const OFFLINE_URL = "/offline.html"')
    expect(serviceWorker).toContain('url.pathname.startsWith("/api/")')
    expect(serviceWorker).toContain('url.pathname.startsWith("/_next/data/")')
    expect(serviceWorker).toContain('request.mode === "navigate"')
    expect(serviceWorker).toContain("caches.match(OFFLINE_URL)")
  })

  it("publishes mobile and Apple PWA metadata", () => {
    const app = fs.readFileSync(path.join(process.cwd(), "pages/_app.js"), "utf8")

    expect(app).toContain('name="mobile-web-app-capable"')
    expect(app).toContain('name="apple-mobile-web-app-capable"')
    expect(app).toContain('rel="manifest" href="/manifest.webmanifest"')
    expect(app).toContain('rel="apple-touch-icon" href="/pwa-icon.svg"')
  })
})
