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
          <img
    src="./favicon.ico"
    
    className="nav-favicon"
  />
  <span>Leigh Pokemon Go Community</span>
        </Link>

        <button className="nav-toggle" onClick={() => setOpen(!open)}>
          ☰
        </button>

        <div className={`nav-links ${open ? "open" : ""}`}>
          <Link href="/" className="nav-item">Home</Link>
          <Link href="/search-strings" className="nav-item">Search Builder</Link>
          <Link href="/pokedex" className="nav-item">Pokédex</Link>

          {session && (
            <>
              <Link href="/entries/add" className="nav-item">Add Entry</Link>
              <Link href="/account" className="nav-item">Account</Link>
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
