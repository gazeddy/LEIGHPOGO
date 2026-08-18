import Link from "next/link"
import { getServerSession } from "next-auth/next"
import { useState } from "react"
import { getCampfireUrl } from "../../lib/siteSettings"
import { authOptions } from "../api/auth/[...nextauth]"

export default function SiteSettings({ initialCampfireUrl }) {
  const [campfireUrl, setCampfireUrl] = useState(initialCampfireUrl || "")
  const [status, setStatus] = useState("")
  const [saving, setSaving] = useState(false)

  const handleSave = async (event) => {
    event.preventDefault()
    setSaving(true)
    setStatus("")

    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campfireUrl }),
      })
      const body = await response.json()

      if (!response.ok) {
        throw new Error(body.error || "Failed to save Campfire URL")
      }

      setCampfireUrl(body.campfireUrl || "")
      setStatus(body.campfireUrl ? "Campfire URL saved." : "Campfire URL cleared.")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save Campfire URL")
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="settings-page">
      <p><Link href="/admin">← Back to Admin Panel</Link></p>
      <h1>Site settings</h1>

      <section className="settings-card">
        <h2>Campfire community</h2>
        <p>
          Paste the Leigh Pokémon GO Campfire community link here. The Campfire card on the public
          homepage is only shown while a URL is configured.
        </p>

        <form onSubmit={handleSave}>
          <label htmlFor="campfire-url">Campfire community URL</label>
          <input
            id="campfire-url"
            type="url"
            inputMode="url"
            placeholder="https://..."
            value={campfireUrl}
            onChange={(event) => setCampfireUrl(event.target.value)}
          />
          <div className="actions">
            <button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Campfire URL"}
            </button>
          </div>
        </form>

        {status && <p className="status" role="status">{status}</p>}
      </section>

      <style jsx>{`
        .settings-page {
          max-width: 820px;
          margin: 0 auto;
          padding: 28px 16px 64px;
        }
        h1 {
          margin: 12px 0 22px;
          font-size: 2.4rem;
        }
        .settings-card {
          border: 1px solid #30363d;
          border-radius: 14px;
          padding: 22px;
          background: #161b22;
        }
        .settings-card h2 {
          margin-top: 0;
        }
        .settings-card p {
          color: #b1bac4;
          line-height: 1.55;
        }
        form {
          display: grid;
          gap: 10px;
          margin-top: 22px;
        }
        label {
          font-weight: 800;
        }
        input {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #30363d;
          border-radius: 8px;
          padding: 11px 12px;
          background: #0d1117;
          color: #f0f6fc;
        }
        .actions {
          margin-top: 4px;
        }
        button {
          border: 0;
          border-radius: 7px;
          padding: 10px 14px;
          background: #238636;
          color: #fff;
          font-weight: 800;
          cursor: pointer;
        }
        button:disabled {
          cursor: wait;
          opacity: 0.65;
        }
        .status {
          margin-bottom: 0;
        }
      `}</style>
    </main>
  )
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions)

  if (!session || session.user.role !== "admin") {
    return {
      redirect: { destination: "/login", permanent: false },
    }
  }

  return {
    props: {
      initialCampfireUrl: await getCampfireUrl(),
    },
  }
}
