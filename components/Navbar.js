import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import favicon from "./favicon.ico";

export default function Navbar() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  useEffect(() => {
    const closeNavigation = () => {
      setOpen(false);
      setToolsOpen(false);
      setAdminOpen(false);
    };

    router.events.on("routeChangeStart", closeNavigation);
    return () => router.events.off("routeChangeStart", closeNavigation);
  }, [router.events]);

  if (status === "loading") return null;

  const isAdmin = session?.user?.role === "admin";

  const toggleTools = () => {
    setToolsOpen((current) => !current);
    setAdminOpen(false);
  };

  const toggleAdmin = () => {
    setAdminOpen((current) => !current);
    setToolsOpen(false);
  };

  const handleLogout = () => {
    setOpen(false);
    setToolsOpen(false);
    setAdminOpen(false);
    signOut({ callbackUrl: "/login" });
  };

  return (
    <nav className="navbar" aria-label="Main navigation">
      <div className="nav-inner">
        <Link href="/" className="nav-logo">
          <Image
            src={favicon}
            alt=""
            aria-hidden="true"
            className="nav-favicon"
          />
          <span>Leigh Pokemon Go Community</span>
        </Link>

        <button
          type="button"
          className="nav-toggle"
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={open}
          aria-controls="primary-navigation"
          onClick={() => setOpen((current) => !current)}
        >
          <span className="nav-toggle-lines" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>

        <div
          id="primary-navigation"
          className={`nav-links ${open ? "open" : ""}`}
        >
          <Link href="/" className="nav-item">Home</Link>
          <Link href="/events" className="nav-item">Events</Link>
          <Link href="/guides" className="nav-item">Guides</Link>

          <div className={`nav-group ${toolsOpen ? "open" : ""}`}>
            <button
              type="button"
              className="nav-item nav-group-toggle"
              aria-expanded={toolsOpen}
              aria-controls="tools-navigation"
              onClick={toggleTools}
            >
              <span>Tools</span>
              <span className="nav-caret" aria-hidden="true">⌄</span>
            </button>
            <div id="tools-navigation" className="nav-submenu">
              <Link href="/search-strings" className="nav-item nav-subitem">
                Search Builder
              </Link>
              <Link href="/pokedex" className="nav-item nav-subitem">
                Pokédex
              </Link>
              {session && (
                <Link href="/gyms" className="nav-item nav-subitem">
                  Gym Map
                </Link>
              )}
            </div>
          </div>

          {session && (
            <>
              <Link href="/account" className="nav-item">Account</Link>

              {isAdmin && (
                <div className={`nav-group nav-group-admin ${adminOpen ? "open" : ""}`}>
                  <button
                    type="button"
                    className="nav-item nav-group-toggle"
                    aria-expanded={adminOpen}
                    aria-controls="admin-navigation"
                    onClick={toggleAdmin}
                  >
                    <span>Admin</span>
                    <span className="nav-caret" aria-hidden="true">⌄</span>
                  </button>
                  <div id="admin-navigation" className="nav-submenu">
                    <Link href="/admin" className="nav-item nav-subitem">
                      Admin Panel
                    </Link>
                    <Link href="/admin/events" className="nav-item nav-subitem">
                      Event Feed
                    </Link>
                    <Link href="/admin/event-types" className="nav-item nav-subitem">
                      Event Types
                    </Link>
                    <Link href="/admin/content" className="nav-item nav-subitem">
                      Content Creator
                    </Link>
                    <Link href="/admin/guide-links" className="nav-item nav-subitem">
                      Guide Links
                    </Link>
                    <Link href="/admin/guide-images" className="nav-item nav-subitem">
                      Guide Pictures
                    </Link>
                    <Link href="/admin/gyms" className="nav-item nav-subitem">
                      Gym Data
                    </Link>
                  </div>
                </div>
              )}

              <button type="button" className="nav-btn" onClick={handleLogout}>
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
