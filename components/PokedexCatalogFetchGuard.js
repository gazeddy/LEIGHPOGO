import { useEffect, useLayoutEffect } from "react"

const POKEDEX_CATALOG_CLIENT_VERSION = 5
const useClientLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect

function versionCatalogUrl(value) {
  if (typeof value !== "string") return value

  const url = new URL(value, window.location.origin)
  if (url.origin !== window.location.origin || url.pathname !== "/api/pokedex-catalog") {
    return value
  }

  url.searchParams.set("v", String(POKEDEX_CATALOG_CLIENT_VERSION))
  url.searchParams.set("request", String(Date.now()))
  return `${url.pathname}${url.search}`
}

export default function PokedexCatalogFetchGuard() {
  useClientLayoutEffect(() => {
    const originalFetch = window.fetch.bind(window)

    window.fetch = (input, init = {}) => {
      const versionedInput = versionCatalogUrl(input)
      if (versionedInput === input) return originalFetch(input, init)

      const headers = new Headers(init.headers || {})
      headers.set("Cache-Control", "no-cache")

      return originalFetch(versionedInput, {
        ...init,
        cache: "no-store",
        headers,
      })
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [])

  return null
}
