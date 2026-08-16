import { useEffect, useState } from "react"
import {
  DEFAULT_TICKER_PREFERENCES,
  TICKER_OPTIONS,
  TICKER_PREFERENCES_EVENT,
} from "../lib/tickerPreferences"

export default function TickerPreferenceSettings() {
  const [preferences, setPreferences] = useState(DEFAULT_TICKER_PREFERENCES)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState("")
  const [status, setStatus] = useState({ type: "", message: "" })

  useEffect(() => {
    let cancelled = false

    async function loadPreferences() {
      try {
        const response = await fetch("/api/ticker-preferences", {
          cache: "no-store",
          headers: { Accept: "application/json" },
        })
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || "Unable to load ticker preferences")
        }

        if (!cancelled) {
          setPreferences({
            ...DEFAULT_TICKER_PREFERENCES,
            ...(data.preferences || {}),
          })
        }
      } catch (error) {
        if (!cancelled) {
          setStatus({
            type: "error",
            message: error.message || "Unable to load ticker preferences",
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadPreferences()

    return () => {
      cancelled = true
    }
  }, [])

  async function updatePreference(tickerType, enabled) {
    const previousValue = preferences[tickerType]
    const update = { [tickerType]: enabled }

    setPreferences((current) => ({ ...current, ...update }))
    setSaving(tickerType)
    setStatus({ type: "", message: "" })
    window.dispatchEvent(
      new CustomEvent(TICKER_PREFERENCES_EVENT, { detail: update }),
    )

    try {
      const response = await fetch("/api/ticker-preferences", {
        method: "PUT",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tickerType, enabled }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Unable to save ticker preference")
      }

      setStatus({ type: "success", message: "Ticker preference saved" })
    } catch (error) {
      const rollback = { [tickerType]: previousValue }
      setPreferences((current) => ({ ...current, ...rollback }))
      window.dispatchEvent(
        new CustomEvent(TICKER_PREFERENCES_EVENT, { detail: rollback }),
      )
      setStatus({
        type: "error",
        message: error.message || "Unable to save ticker preference",
      })
    } finally {
      setSaving("")
    }
  }

  return (
    <div className="ticker-preference-settings">
      <h2>Ticker preferences</h2>
      <p className="ticker-preference-intro">
        Choose which site-wide tickers you want to see. Tickers also hide
        automatically when you open their own page.
      </p>

      <div className="ticker-preference-list" aria-busy={loading}>
        {TICKER_OPTIONS.map((option) => {
          const checked = preferences[option.key] !== false
          const isSaving = saving === option.key

          return (
            <label key={option.key} className="ticker-preference-row">
              <span className="ticker-preference-copy">
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </span>
              <span className="ticker-preference-control">
                <input
                  type="checkbox"
                  role="switch"
                  checked={checked}
                  disabled={loading || Boolean(saving)}
                  onChange={(event) =>
                    void updatePreference(option.key, event.target.checked)
                  }
                />
                <span>{isSaving ? "Saving…" : checked ? "On" : "Off"}</span>
              </span>
            </label>
          )
        })}
      </div>

      {status.message && (
        <p
          className={`ticker-preference-status ${status.type}`}
          role={status.type === "error" ? "alert" : "status"}
        >
          {status.message}
        </p>
      )}

      <style jsx>{`
        .ticker-preference-intro {
          margin-top: 0;
          color: #8b949e;
        }

        .ticker-preference-list {
          display: grid;
          gap: 10px;
          max-width: 720px;
        }

        .ticker-preference-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          border: 1px solid #30363d;
          border-radius: 10px;
          padding: 12px 14px;
          background: #161b22;
          cursor: pointer;
        }

        .ticker-preference-copy {
          display: grid;
          gap: 4px;
          min-width: 0;
        }

        .ticker-preference-copy span {
          color: #8b949e;
          font-size: 0.9rem;
        }

        .ticker-preference-control {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 0 0 auto;
          color: #c9d1d9;
          font-weight: 700;
        }

        .ticker-preference-control input {
          width: 20px;
          height: 20px;
          accent-color: #238636;
          cursor: pointer;
        }

        .ticker-preference-control input:disabled {
          cursor: progress;
        }

        .ticker-preference-status {
          margin-bottom: 0;
          font-weight: 700;
        }

        .ticker-preference-status.success {
          color: #3fb950;
        }

        .ticker-preference-status.error {
          color: #ff7b72;
        }

        @media (max-width: 620px) {
          .ticker-preference-row {
            align-items: flex-start;
          }

          .ticker-preference-copy span {
            font-size: 0.82rem;
          }
        }
      `}</style>
    </div>
  )
}
