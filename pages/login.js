import { getCsrfToken, signIn, getSession } from "next-auth/react"
import { useState } from "react"
import { useRouter } from "next/router"

export default function Login({ csrfToken }) {
  const [ign, setIgn] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [mode, setMode] = useState("login") // login | register
  const [error, setError] = useState("")
  const router = useRouter()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")

    if (mode === "register") {
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

      alert("Registration successful! Please sign in.")
      setMode("login")
      setPassword("")
      return
    }

    // LOGIN
    const result = await signIn("credentials", {
      redirect: false,
      ign,
      password,
    })

    if (result?.error) {
      setError("Invalid IGN or password")
    } else {
      router.push("/")
    }
  }

  return (
    <div className="login-container">
      <h1>{mode === "login" ? "Login" : "Register"}</h1>

      <form onSubmit={handleSubmit}>
        <input name="csrfToken" type="hidden" defaultValue={csrfToken} />

        {mode === "register" && (
        <label>
  Name (optional)
  <input
    type="text"
    value={name}
    onChange={(e) => setName(e.target.value)}
    placeholder="Optional"
  />
</label>
        )}

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

        <button type="submit">
          {mode === "login" ? "Login" : "Register"}
        </button>

        {error && <p style={{ color: "red" }}>{error}</p>}
      </form>

      <p style={{ marginTop: "1rem" }}>
        {mode === "login" ? (
          <>
            Don’t have an account?{" "}
            <button onClick={() => setMode("register")}>Register</button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button onClick={() => setMode("login")}>Login</button>
          </>
        )}
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

  return {
    props: {
      csrfToken: (await getCsrfToken(context)) ?? null,
    },
  }
}
