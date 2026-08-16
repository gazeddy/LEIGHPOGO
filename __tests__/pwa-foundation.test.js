const fs = require("fs")
const path = require("path")

describe("PWA foundation", () => {
  it("provides an installable standalone manifest with PNG app icons and shortcuts", () => {
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
          src: "/pwa-icon-192.png",
          sizes: "192x192",
          type: "image/png",
        }),
        expect.objectContaining({
          src: "/pwa-icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
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
    expect(serviceWorker).toContain('const DEFAULT_ICON = "/pwa-icon-192.png"')
  })

  it("publishes mobile and Apple PWA metadata", () => {
    const app = fs.readFileSync(path.join(process.cwd(), "pages/_app.js"), "utf8")

    expect(app).toContain('name="mobile-web-app-capable"')
    expect(app).toContain('name="apple-mobile-web-app-capable"')
    expect(app).toContain('rel="manifest" href="/manifest.webmanifest"')
    expect(app).toContain('rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"')
    expect(app).toContain('import "../styles/pwa.css"')
  })

  it("ships the icon and offline assets referenced by the manifest and metadata", () => {
    for (const asset of [
      "public/pwa-icon-192.png",
      "public/pwa-icon-512.png",
      "public/apple-touch-icon.png",
      "public/offline.html",
    ]) {
      expect(fs.existsSync(path.join(process.cwd(), asset))).toBe(true)
    }
  })

  it("provides a discoverable install flow for Chromium and iOS", () => {
    const bootstrap = fs.readFileSync(
      path.join(process.cwd(), "components/PwaBootstrap.js"),
      "utf8",
    )

    expect(bootstrap).toContain('window.addEventListener("beforeinstallprompt"')
    expect(bootstrap).toContain('window.addEventListener("appinstalled"')
    expect(bootstrap).toContain("await prompt.prompt()")
    expect(bootstrap).toContain("Add to Home Screen")
    expect(bootstrap).toContain('window.navigator.standalone === true')
  })

  it("keeps generated and local Next.js files out of version control", () => {
    const gitignore = fs.readFileSync(path.join(process.cwd(), ".gitignore"), "utf8")

    expect(gitignore).toContain(".next/")
    expect(gitignore).toContain("next-env.d.ts")
    expect(gitignore).toContain(".env*")
    expect(gitignore).toContain("!.env.example")
  })
})
