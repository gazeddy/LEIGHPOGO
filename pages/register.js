import Link from "next/link"
import { useState } from "react"
import { getSession } from "next-auth/react"
import { useRouter } from "next/router"

export default function Register() {
  const [name, setName] = useState("")
  const [ign, setIgn] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const router = useRouter()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setSuccess("")

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, ign, password }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error || "Registration failed")
      return
    }

    setSuccess("Registration successful! Please sign in.")
    setPassword("")
    setName("")
    setIgn("")
    setTimeout(() => router.push("/login"), 1000)
  }

  return (
    <div className="login-container">
      <h1>Register</h1>

      <form onSubmit={handleSubmit}>
        <label>
          Name (optional)
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Optional"
          />
        </label>

        <label>
          In-Game Name
          <input
            type="text"
            value={ign}
            onChange={(e) => setIgn(e.target.value)}
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        <button type="submit">Register</button>

        {error && <p style={{ color: "red" }}>{error}</p>}
        {success && <p style={{ color: "green" }}>{success}</p>}
      </form>

      <p style={{ marginTop: "1rem" }}>
        Already have an account? <Link href="/login">Login</Link>
      </p>
    </div>
  )
}

export async function getServerSideProps(context) {
  const session = await getSession(context)
  if (session) {
    return {
      redirect: { destination: "/", permanent: false },
    }
  }

  return { props: {} }
}
