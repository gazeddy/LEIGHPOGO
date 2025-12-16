import { getCsrfToken, signIn, getSession } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/router";

export default function Login({ csrfToken }) {
  const [ign, setIgn] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();

    const result = await signIn("credentials", {
      redirect: false,
      ign,
      password,
    });

    if (result.error) {
      alert(result.error);
    } else {
      router.push("/"); // redirect to home on success
    }
  };

  return (
    <div className="login-container">
      <h1>Login</h1>
      <form onSubmit={handleSubmit}>
        <input name="csrfToken" type="hidden" defaultValue={csrfToken} />
        <label>
          In-Game Name
          <input
            name="ign"
            type="text"
            value={ign}
            onChange={(e) => setIgn(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button type="submit">Login</button>
      </form>
    </div>
  );
}

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (session) {
    return { redirect: { destination: "/", permanent: false } };
  }

  return {
    props: { csrfToken: await getCsrfToken(context) },
  };
}
