import { useState } from "react"
import { getServerSession } from "next-auth/next"
import { authOptions } from "./api/auth/[...nextauth]"

export default function Account() {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [status, setStatus] = useState({ type: "", message: "" })

  const handleSubmit = async (event) => {
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

  return (
    <div className="container">
      <h1>Account settings</h1>

      <section>
        <h2>Change password</h2>
        <form onSubmit={handleSubmit} className="stack">
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

  return { props: {} }
}
