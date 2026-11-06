import Link from "next/link"
import { getCsrfToken, signIn, getSession } from "next-auth/react"
import { useState } from "react"
import { useRouter } from "next/router"

export function giftReturnPath(value) {
  return typeof value === "string" && (value === "/gifts" || /^\/gifts\/[a-zA-Z0-9-]+$/.test(value)) ? value : "/"
}

export default function Login({ csrfToken }) {
  const [ign, setIgn] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const router = useRouter()
  const next = giftReturnPath(router.query.next)
  async function handleSubmit(event) {
    event.preventDefault()
    setError("")
    const result = await signIn("credentials", { redirect: false, ign, password })
    if (result?.error) setError("Invalid IGN or password")
    else await router.push(next)
  }
  return <div className="login-container">
    <h1>Login</h1>
    <form onSubmit={handleSubmit}>
      <input name="csrfToken" type="hidden" defaultValue={csrfToken} />
      <label>In-Game Name<input value={ign} onChange={e => setIgn(e.target.value)} required /></label>
      <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
      <button type="submit">Login</button>
      {error && <p className="form-error">{error}</p>}
    </form>
    <p>Not registered? <Link href={"/register?next=" + encodeURIComponent(next)}>Create a LeighPogo account</Link></p>
  </div>
}
export async function getServerSideProps(context) {
  const session = await getSession(context)
  const next = giftReturnPath(context.query.next)
  if (session) return { redirect: { destination: next, permanent: false } }
  return { props: { csrfToken: (await getCsrfToken(context)) ?? null } }
}
