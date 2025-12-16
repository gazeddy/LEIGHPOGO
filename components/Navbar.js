import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";

export default function Navbar() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);

  if (status === "loading") return null; // avoid flicker while loading

  const isAdmin = session?.user?.role === "admin";

  return (
    <nav className="navbar">
      <div className="nav-inner">
        <Link href="/" className="nav-logo">
          Pokémon GO Codes
        </Link>

        <button className="nav-toggle" onClick={() => setOpen(!open)}>
          ☰
        </button>

        <div className={`nav-links ${open ? "open" : ""}`}>
          <Link href="/" className="nav-item">Home</Link>
          <Link href="/search-strings" className="nav-item">Search Builder</Link>

          {session && (
            <>
              <Link href="/entries/add" className="nav-item">Add Entry</Link>
              {isAdmin && <Link href="/admin" className="nav-item">Admin Panel</Link>}
              <button
                className="nav-btn"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                Logout
              </button>
            </>
          )}

          {!session && (
            <Link href="/login" className="nav-item">Login</Link>
          )}
        </div>
      </div>
    </nav>
  );
}
