import { useState } from "react"
import { getServerSession } from "next-auth/next"
import { signOut } from "next-auth/react"
import { authOptions } from "./api/auth/[...nextauth]"
import prisma from "../lib/prisma"
import TeamBadge from "../components/TeamBadge"
import PwaInstallButton from "../components/PwaInstallButton"
import TickerPreferenceSettings from "../components/TickerPreferenceSettings"
import { formatFriendCodeInput } from "../lib/friendCode"

export default function Account({ entry }) {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [status, setStatus] = useState({ type: "", message: "" })
  const [friendCode, setFriendCode] = useState(
    formatFriendCodeInput(entry?.friendCode || ""),
  )
  const [team, setTeam] = useState(entry?.team || "MYSTIC")
  const [profileStatus, setProfileStatus] = useState({ type: "", message: "" })
  const [deletePassword, setDeletePassword] = useState("")
  const [deleteConfirmation, setDeleteConfirmation] = useState("")
  const [deleteStatus, setDeleteStatus] = useState({ type: "", message: "" })
  const [deleting, setDeleting] = useState(false)

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

  const handleProfileSubmit = async (event) => {
    event.preventDefault()
    setProfileStatus({ type: "", message: "" })

    const res = await fetch("/api/account", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendCode, team }),
    })

    const data = await res.json()

    if (!res.ok) {
      setProfileStatus({
        type: "error",
        message: data.error || "Unable to update trainer profile",
      })
      return
    }

    if (data.team) setTeam(data.team)
    if (typeof data.friendCode === "string") {
      setFriendCode(formatFriendCodeInput(data.friendCode))
    }

    setProfileStatus({ type: "success", message: "Trainer profile updated" })
  }

  const handleDeleteAccount = async (event) => {
    event.preventDefault()
    setDeleteStatus({ type: "", message: "" })

    if (deleteConfirmation !== "DELETE") {
      setDeleteStatus({ type: "error", message: "Type DELETE exactly to confirm." })
      return
    }

    setDeleting(true)
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: deletePassword,
          confirmation: deleteConfirmation,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setDeleteStatus({
          type: "error",
          message: data.error || "Unable to delete account",
        })
        return
      }

      await signOut({ callbackUrl: "/" })
    } catch {
      setDeleteStatus({ type: "error", message: "Unable to delete account. Please try again." })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="container">
      <h1>Account settings</h1>

      <section>
        <PwaInstallButton />
      </section>

      <section>
        <TickerPreferenceSettings />
      </section>

      <section>
        <h2>Trainer profile</h2>
        <form onSubmit={handleProfileSubmit} className="stack">
          <label>
            Team
            <select value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="INSTINCT">Instinct (Yellow)</option>
              <option value="MYSTIC">Mystic (Blue)</option>
              <option value="VALOR">Valor (Red)</option>
            </select>
          </label>

          <label>
            Friend code
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={14}
              value={friendCode}
              onChange={(e) => setFriendCode(formatFriendCodeInput(e.target.value))}
              placeholder="0000 0000 0000"
            />
          </label>

          <TeamBadge team={team} />

          <button type="submit">Save profile</button>
          {profileStatus.message && (
            <p style={{ color: profileStatus.type === "error" ? "red" : "green" }}>
              {profileStatus.message}
            </p>
          )}
        </form>
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

      <section className="danger-zone">
        <h2>Delete account</h2>
        <p>
          Permanently deletes your LeighPogo account and account-linked friend-code, Pokédex, trade,
          notification, preference and import data. This cannot be undone.
        </p>
        <form onSubmit={handleDeleteAccount} className="stack">
          <label>
            Current password
            <input
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              required
            />
          </label>
          <label>
            Type DELETE to confirm
            <input
              type="text"
              autoComplete="off"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              placeholder="DELETE"
              required
            />
          </label>
          <button
            type="submit"
            className="danger"
            disabled={deleting || !deletePassword || deleteConfirmation !== "DELETE"}
          >
            {deleting ? "Deleting account…" : "Delete my account"}
          </button>
          {deleteStatus.message && (
            <p className={deleteStatus.type === "error" ? "form-error" : "status"}>
              {deleteStatus.message}
            </p>
          )}
        </form>
      </section>
    </div>
  )
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions)

  if (!session?.user?.id) {
    return {
      redirect: { destination: "/login", permanent: false },
    }
  }

  const latestEntry = await prisma.entry.findFirst({
    where: { ownerId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: { trainerName: true, code: true, team: true },
  })

  return {
    props: {
      entry: latestEntry
        ? { friendCode: latestEntry.code, team: latestEntry.team, trainerName: latestEntry.trainerName }
        : null,
    },
  }
}
