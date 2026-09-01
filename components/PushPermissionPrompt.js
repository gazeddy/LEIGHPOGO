import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"

const PROMPT_STORAGE_KEY = "leighpogo:push-permission-prompt:2026-09-01"

const urlBase64ToUint8Array = (value) => {
  const padding = "=".repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(base64)

  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London"
  } catch {
    return "Europe/London"
  }
}

const markPromptHandled = () => {
  try {
    window.localStorage.setItem(PROMPT_STORAGE_KEY, "handled")
  } catch {}
}

const promptWasHandled = () => {
  try {
    return window.localStorage.getItem(PROMPT_STORAGE_KEY) === "handled"
  } catch {
    return false
  }
}

const saveSubscription = (subscription) =>
  fetch("/api/push/subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      timeZone: browserTimeZone(),
    }),
  })

export default function PushPermissionPrompt() {
  const { status } = useSession()
  const [visible, setVisible] = useState(false)
  const [publicKey, setPublicKey] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (status !== "authenticated" || typeof window === "undefined") return
    if (promptWasHandled()) return

    let cancelled = false

    const inspect = async () => {
      const supported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window

      if (!supported) return

      if (Notification.permission === "denied") {
        markPromptHandled()
        return
      }

      try {
        const [registration, configResponse] = await Promise.all([
          navigator.serviceWorker.ready,
          fetch("/api/push/config", { cache: "no-store" }),
        ])

        if (!configResponse.ok) return

        const config = await configResponse.json()
        if (!config.configured || !config.publicKey) return

        const existingSubscription = await registration.pushManager.getSubscription()
        if (existingSubscription) {
          await saveSubscription(existingSubscription).catch(() => {})
          markPromptHandled()
          return
        }

        if (!cancelled) {
          setPublicKey(config.publicKey)
          setVisible(true)
        }
      } catch {
        // Keep this prompt non-blocking if push state cannot be inspected.
      }
    }

    inspect()

    return () => {
      cancelled = true
    }
  }, [status])

  const dismiss = () => {
    markPromptHandled()
    setVisible(false)
  }

  const enable = async () => {
    if (busy || !publicKey) return

    setBusy(true)
    setMessage("")

    let createdSubscription = null

    try {
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission()

      if (permission !== "granted") {
        markPromptHandled()
        setVisible(false)
        return
      }

      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        })
        createdSubscription = subscription
      }

      const response = await saveSubscription(subscription)
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || "Unable to enable notifications.")
      }

      markPromptHandled()
      setVisible(false)
    } catch (error) {
      if (createdSubscription) {
        await createdSubscription.unsubscribe().catch(() => {})
      }
      setMessage(error instanceof Error ? error.message : "Unable to enable notifications.")
    } finally {
      setBusy(false)
    }
  }

  if (!visible) return null

  return (
    <div className="push-permission-backdrop" role="presentation">
      <section
        className="push-permission-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="push-permission-title"
      >
        <h2 id="push-permission-title">Enable LEIGHPOGO notifications?</h2>
        <p>
          Get raid reminders, trade alerts and new-gym notifications even when LEIGHPOGO is closed.
          Alert types are on by default and can be switched off individually from Notifications.
        </p>
        {message && <p className="push-permission-error">{message}</p>}
        <div className="push-permission-actions">
          <button type="button" onClick={enable} disabled={busy}>
            {busy ? "Enabling..." : "Enable notifications"}
          </button>
          <button type="button" className="secondary-button" onClick={dismiss} disabled={busy}>
            Not now
          </button>
        </div>
      </section>
      <style jsx>{`
        .push-permission-backdrop {
          position: fixed;
          inset: 0;
          z-index: 5000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(0, 0, 0, 0.68);
        }

        .push-permission-dialog {
          width: min(100%, 460px);
          padding: 22px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 14px;
          background: #111827;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
        }

        h2 {
          margin: 0 0 10px;
        }

        p {
          margin: 0;
          line-height: 1.5;
        }

        .push-permission-error {
          margin-top: 12px;
          color: #fca5a5;
        }

        .push-permission-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 18px;
        }
      `}</style>
    </div>
  )
}
