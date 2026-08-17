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
          src: "/pwa-icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        }),
      ]),
    )
    expect(manifest.shortcuts.map((shortcut) => shortcut.url)).toEqual(
      expect.arrayContaining([
        "/gyms?add=1#add-gym",
        "/friend-codes",
        "/gyms",
        "/trades",
      ]),
    )
  })

  it("uses an offline fallback without caching authenticated or API data", () => {
    const serviceWorker = fs.readFileSync(
      path.join(process.cwd(), "public/sw.js"),
      "utf8",
    )

    expect(serviceWorker).toContain('const STATIC_CACHE = "leighpogo-static-v4"')
    expect(serviceWorker).toContain('const OFFLINE_URL = "/offline.html"')
    expect(serviceWorker).toContain('url.pathname.startsWith("/api/")')
    expect(serviceWorker).toContain('url.pathname.startsWith("/_next/data/")')
    expect(serviceWorker).toContain('request.mode === "navigate"')
    expect(serviceWorker).toContain("caches.match(OFFLINE_URL)")
    expect(serviceWorker).toContain('const DEFAULT_ICON = "/pwa-icon-192.png"')
    expect(serviceWorker).toContain('"/favicon.ico"')
    expect(serviceWorker).toContain('"/pwa-icon-maskable-512.png"')
  })

  it("publishes mobile, browser and Apple metadata using the release artwork", () => {
    const app = fs.readFileSync(path.join(process.cwd(), "pages/_app.js"), "utf8")

    expect(app).toContain('name="mobile-web-app-capable"')
    expect(app).toContain('name="apple-mobile-web-app-capable"')
    expect(app).toContain('rel="manifest" href="/manifest.webmanifest"')
    expect(app).toContain(
      'rel="icon" href="/pwa-icon-192.png" type="image/png" sizes="192x192"',
    )
    expect(app).toContain('rel="shortcut icon" href="/favicon.ico"')
    expect(app).toContain(
      'rel="apple-touch-icon" sizes="192x192" href="/apple-touch-icon.png"',
    )
    expect(app).not.toContain("/pwa-icon.svg")
    expect(app).toContain('import "../styles/pwa.css"')
  })

  it("generates the release icon assets from the complete checked-in Leigh artwork source", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    )
    const sourceParts = fs
      .readdirSync(path.join(process.cwd(), "assets/pwa-icons"))
      .filter((name) => name.startsWith("release-source.b64.part"))
      .sort()

    expect(packageJson.scripts.prebuild).toBe(
      "node scripts/generatePwaIconsFixed.js",
    )
    expect(sourceParts).toHaveLength(6)
    expect(sourceParts[0]).toBe("release-source.b64.part01")
    expect(sourceParts[5]).toBe("release-source.b64.part06")

    for (const asset of [
      "scripts/generatePwaIconsFixed.js",
      "public/favicon.ico",
      "public/pwa-icon-192.png",
      "public/pwa-icon-512.png",
      "public/pwa-icon-maskable-512.png",
      "public/apple-touch-icon.png",
      "public/offline.html",
    ]) {
      expect(fs.existsSync(path.join(process.cwd(), asset))).toBe(true)
    }
  })

  it("captures Chromium install capability without showing a global install banner", () => {
    const bootstrap = fs.readFileSync(
      path.join(process.cwd(), "components/PwaBootstrap.js"),
      "utf8",
    )

    expect(bootstrap).toContain('window.addEventListener("beforeinstallprompt"')
    expect(bootstrap).toContain('window.addEventListener("appinstalled"')
    expect(bootstrap).toContain("window[PWA_PROMPT_KEY] = event")
    expect(bootstrap).toContain('window.dispatchEvent(new Event(READY_EVENT))')
    expect(bootstrap).not.toContain("pwa-install-banner")
  })

  it("exposes the install action only from the authenticated account page", () => {
    const account = fs.readFileSync(path.join(process.cwd(), "pages/account.js"), "utf8")
    const installButton = fs.readFileSync(
      path.join(process.cwd(), "components/PwaInstallButton.js"),
      "utf8",
    )

    expect(account).toContain('import PwaInstallButton from "../components/PwaInstallButton"')
    expect(account).toContain("<PwaInstallButton />")
    expect(account).toContain("getServerSession")
    expect(account).toContain('redirect: { destination: "/login", permanent: false }')
    expect(installButton).toContain("Install LEIGHPOGO")
    expect(installButton).toContain("await prompt.prompt()")
    expect(installButton).toContain("SamsungBrowser")
    expect(installButton).toContain("Add to Home Screen")
  })

  it("keeps generated and local Next.js files out of version control", () => {
    const gitignore = fs.readFileSync(path.join(process.cwd(), ".gitignore"), "utf8")

    expect(gitignore).toContain(".next/")
    expect(gitignore).toContain("next-env.d.ts")
    expect(gitignore).toContain(".env*")
    expect(gitignore).toContain("!.env.example")
    expect(gitignore).toContain("/public/favicon.ico")
    expect(gitignore).toContain("/public/pwa-icon-192.png")
    expect(gitignore).toContain("/public/pwa-icon-maskable-512.png")
  })
})
