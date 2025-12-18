import { useState } from "react"
import { getServerSession } from "next-auth/next"
import { authOptions } from "./api/auth/[...nextauth]"
import prisma from "../lib/prisma"
import TeamBadge from "../components/TeamBadge"

export default function Account({ entries }) {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [status, setStatus] = useState({ type: "", message: "" })
  const [ownedEntries, setOwnedEntries] = useState(entries || [])
  const [entryStatuses, setEntryStatuses] = useState({})

  const handlePasswordSubmit = async (event) => {
    event.preventDefault()
    setStatus({ type: "", message: "" })

    if (newPassword !== confirmPassword) {
      setStatus({ type: "error", message: "New passwords do not match" })
      return
    }

    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    })

    const data = await res.json()

    if (!res.ok) {
      setStatus({ type: "error", message: data.error || "Unable to update password" })
      return
    }

    setStatus({ type: "success", message: "Password updated successfully" })
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
  }

  const handleEntryChange = (id, field, value) => {
    setOwnedEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry))
    )
  }

  const handleEntrySubmit = async (event, entryId) => {
    event.preventDefault()
    setEntryStatuses((prev) => ({ ...prev, [entryId]: { type: "", message: "" } }))

    const entry = ownedEntries.find((item) => item.id === entryId)
    if (!entry) return

    const res = await fetch(`/api/entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trainerName: entry.trainerName,
        friendCode: entry.code,
        team: entry.team,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      setEntryStatuses((prev) => ({
        ...prev,
        [entryId]: { type: "error", message: data.error || "Unable to update entry" },
      }))
      return
    }

    setOwnedEntries((current) =>
      current.map((item) => (item.id === entryId ? { ...item, ...data } : item))
    )

    setEntryStatuses((prev) => ({
      ...prev,
      [entryId]: { type: "success", message: "Trainer entry updated" },
    }))
  }

  return (
    <div className="container">
      <h1>Account settings</h1>

      <section>
        <h2>Your friend codes</h2>
        {ownedEntries.length === 0 ? (
          <p className="muted">No friend codes added yet.</p>
        ) : (
          <div className="stack">
            {ownedEntries.map((entry) => (
              <form key={entry.id} onSubmit={(event) => handleEntrySubmit(event, entry.id)} className="stack">
                <label>
                  Trainer name
                  <input type="text" value={entry.trainerName} disabled />
                </label>

                <label>
                  Team
                  <select
                    value={entry.team}
                    onChange={(e) => handleEntryChange(entry.id, "team", e.target.value)}
                  >
                    <option value="INSTINCT">Instinct (Yellow)</option>
                    <option value="MYSTIC">Mystic (Blue)</option>
                    <option value="VALOR">Valor (Red)</option>
                  </select>
                </label>

                <label>
                  Friend code
                  <input
                    type="text"
                    value={entry.code}
                    onChange={(e) => handleEntryChange(entry.id, "code", e.target.value)}
                    placeholder="0000 0000 0000"
                  />
                </label>

                <TeamBadge team={entry.team} />

                <button type="submit">Save entry</button>
                {entryStatuses[entry.id]?.message && (
                  <p
                    style={{
                      color: entryStatuses[entry.id].type === "error" ? "red" : "green",
                    }}
                  >
                    {entryStatuses[entry.id].message}
                  </p>
                )}
              </form>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2>Change password</h2>
        <form onSubmit={handlePasswordSubmit} className="stack">
          <label>
            Current password
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>

          <label>
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </label>

          <label>
            Confirm new password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </label>

          <button type="submit">Update password</button>
          {status.message && (
            <p style={{ color: status.type === "error" ? "red" : "green" }}>
              {status.message}
            </p>
          )}
        </form>
      </section>
    </div>
  )
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions)

  if (!session) {
    return {
      redirect: { destination: "/login", permanent: false },
    }
  }

  const ownedEntries = await prisma.entry.findMany({
    where: { ownerId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, trainerName: true, code: true, team: true },
  })

  return {
    props: { entries: ownedEntries },
  }
}
