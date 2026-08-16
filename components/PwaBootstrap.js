import { useEffect, useState } from "react"

const DISMISS_KEY = "leighpogo-pwa-install-dismissed"

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true
  )
}

function isIosDevice() {
  const userAgent = window.navigator.userAgent || ""
  const iOS = /iphone|ipad|ipod/i.test(userAgent)
  const iPadDesktopMode =
    window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1

  return iOS || iPadDesktopMode
}

export default function PwaBootstrap() {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [showIosHelp, setShowIosHelp] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
        console.error("Failed to register LEIGHPOGO service worker", error)
      })
    }

    if (isStandalone()) {
      setInstalled(true)
      return undefined
    }

    let dismissedThisSession = false
    try {
      dismissedThisSession = window.sessionStorage.getItem(DISMISS_KEY) === "1"
    } catch {
      dismissedThisSession = false
    }

    setDismissed(dismissedThisSession)

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault()
      if (!dismissedThisSession) {
        setInstallPrompt(event)
      }
    }

    const handleAppInstalled = () => {
      setInstalled(true)
      setInstallPrompt(null)
      setShowIosHelp(false)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    window.addEventListener("appinstalled", handleAppInstalled)

    if (isIosDevice() && !dismissedThisSession) {
      setShowIosHelp(true)
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
      window.removeEventListener("appinstalled", handleAppInstalled)
    }
  }, [])

  const dismiss = () => {
    setDismissed(true)
    setInstallPrompt(null)
    setShowIosHelp(false)
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1")
    } catch {
      // Ignore storage failures; dismissal still applies for this render.
    }
  }

  const install = async () => {
    if (!installPrompt) return

    const prompt = installPrompt
    setInstallPrompt(null)

    try {
      const result = await prompt.prompt()
      if (result?.outcome === "accepted") {
        setInstalled(true)
      } else {
        dismiss()
      }
    } catch (error) {
      console.error("Failed to open the LEIGHPOGO install prompt", error)
    }
  }

  if (installed || dismissed || (!installPrompt && !showIosHelp)) {
    return null
  }

  return (
    <aside className="pwa-install-banner" aria-live="polite" aria-label="Install LEIGHPOGO">
      <div className="pwa-install-copy">
        <strong>Install LEIGHPOGO</strong>
        <p>
          {showIosHelp
            ? "On iPhone or iPad, open your browser Share menu and choose Add to Home Screen."
            : "Install LEIGHPOGO on this device for an app-style home-screen experience."}
        </p>
      </div>

      <div className="pwa-install-actions">
        {installPrompt && (
          <button type="button" className="pwa-install-button" onClick={install}>
            Install
          </button>
        )}
      </div>

      <button
        type="button"
        className="pwa-install-dismiss"
        aria-label="Dismiss install prompt"
        onClick={dismiss}
      >
        ×
      </button>
    </aside>
  )
}
