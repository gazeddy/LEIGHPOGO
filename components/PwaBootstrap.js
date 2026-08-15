import { useEffect } from "react"

export default function PwaBootstrap() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return

    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
      console.error("Failed to register LEIGHPOGO service worker", error)
    })
  }, [])

  return null
}
