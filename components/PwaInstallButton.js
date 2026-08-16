import { useEffect, useState } from "react"

const PWA_PROMPT_KEY = "__leighpogoPwaInstallPrompt"
const READY_EVENT = "leighpogo:pwa-install-ready"
const INSTALLED_EVENT = "leighpogo:pwa-installed"

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

function isSamsungInternet() {
  return /SamsungBrowser/i.test(window.navigator.userAgent || "")
}

export default function PwaInstallButton() {
  const [available, setAvailable] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    const syncState = () => {
      setInstalled(isStandalone())
      setAvailable(Boolean(window[PWA_PROMPT_KEY]))
    }

    const handleInstalled = () => {
      setInstalled(true)
      setAvailable(false)
      setMessage("LEIGHPOGO is installed on this device.")
    }

    syncState()
    window.addEventListener(READY_EVENT, syncState)
    window.addEventListener(INSTALLED_EVENT, handleInstalled)

    return () => {
      window.removeEventListener(READY_EVENT, syncState)
      window.removeEventListener(INSTALLED_EVENT, handleInstalled)
    }
  }, [])

  const install = async () => {
    setMessage("")

    if (installed || isStandalone()) {
      setInstalled(true)
      setMessage("LEIGHPOGO is already installed on this device.")
      return
    }

    if (isSamsungInternet()) {
      setMessage(
        "Samsung Internet is currently producing an Android wrapper that Play Protect may block. Open dev.leighpogo.co.uk in Chrome and use this button there instead.",
      )
      return
    }

    if (isIosDevice()) {
      setMessage(
        "On iPhone or iPad, open the Share menu and choose Add to Home Screen.",
      )
      return
    }

    const prompt = window[PWA_PROMPT_KEY]
    if (!prompt) {
      setMessage(
        "Chrome has not exposed the install prompt yet. Open Chrome's menu and look for Install app or Add to Home screen, then reload this page if needed.",
      )
      return
    }

    window[PWA_PROMPT_KEY] = null
    setAvailable(false)

    try {
      const result = await prompt.prompt()
      if (result?.outcome === "accepted") {
        setMessage("Installation started.")
      } else {
        setMessage("Installation was cancelled.")
      }
    } catch (error) {
      console.error("Failed to open the LEIGHPOGO install prompt", error)
      setMessage(
        "The browser could not open its install dialog. Try Chrome's menu and choose Install app or Add to Home screen.",
      )
    }
  }

  return (
    <div className="pwa-account-install">
      <div>
        <h2>LEIGHPOGO app</h2>
        <p className="muted">
          Install LEIGHPOGO on this device for a home-screen app experience.
        </p>
      </div>

      <button type="button" onClick={install} disabled={installed}>
        {installed ? "LEIGHPOGO installed" : "Install LEIGHPOGO"}
      </button>

      {!installed && available && (
        <p className="pwa-install-ready">Ready to install on this browser.</p>
      )}

      {message && <p className="pwa-install-status">{message}</p>}
    </div>
  )
}
