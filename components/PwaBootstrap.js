import { useEffect } from "react"

const PWA_PROMPT_KEY = "__leighpogoPwaInstallPrompt"
const READY_EVENT = "leighpogo:pwa-install-ready"
const INSTALLED_EVENT = "leighpogo:pwa-installed"

export default function PwaBootstrap() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
        console.error("Failed to register LEIGHPOGO service worker", error)
      })
    }

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault()
      window[PWA_PROMPT_KEY] = event
      window.dispatchEvent(new Event(READY_EVENT))
    }

    const handleAppInstalled = () => {
      window[PWA_PROMPT_KEY] = null
      window.dispatchEvent(new Event(INSTALLED_EVENT))
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    window.addEventListener("appinstalled", handleAppInstalled)

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
      window.removeEventListener("appinstalled", handleAppInstalled)
    }
  }, [])

  return null
}
