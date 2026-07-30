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

  useEffect(() => {
    const closeMenu = () => setOpen(false);
    router.events.on("routeChangeComplete", closeMenu);

    return () => router.events.off("routeChangeComplete", closeMenu);
  }, [router.events]);

  useEffect(() => {
    if (!open) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  if (status === "loading") return null;

  const isAdmin = session?.user?.role === "admin";
  const closeMenu = () => setOpen(false);

  return (
    <nav className="navbar">
      <div className="nav-inner">
        <Link href="/" className="nav-logo" onClick={closeMenu}>
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
          aria-controls="site-navigation"
          onClick={() => setOpen((current) => !current)}
        >
          <span aria-hidden="true">{open ? "×" : "☰"}</span>
        </button>

        <button
          type="button"
          className={`nav-backdrop ${open ? "open" : ""}`}
          aria-label="Close navigation menu"
          tabIndex={open ? 0 : -1}
          onClick={closeMenu}
        />

        <div
          id="site-navigation"
          className={`nav-links ${open ? "open" : ""}`}
        >
          <Link href="/" className="nav-item" onClick={closeMenu}>Home</Link>
          <Link href="/events" className="nav-item" onClick={closeMenu}>Events</Link>
          <Link href="/guides" className="nav-item" onClick={closeMenu}>Guides</Link>

          <details className="nav-group">
            <summary className="nav-group-toggle">
              <span>Tools</span>
              <span className="nav-chevron" aria-hidden="true">⌄</span>
            </summary>
            <div className="nav-submenu">
              <Link href="/search-strings" className="nav-subitem" onClick={closeMenu}>
                Search Builder
              </Link>
              <Link href="/pokedex" className="nav-subitem" onClick={closeMenu}>
                Pokédex
              </Link>
            </div>
          </details>

          {session && (
            <>
              <Link href="/account" className="nav-item" onClick={closeMenu}>
                Account
              </Link>

              {isAdmin && (
                <details className="nav-group">
                  <summary className="nav-group-toggle">
                    <span>Admin</span>
                    <span className="nav-chevron" aria-hidden="true">⌄</span>
                  </summary>
                  <div className="nav-submenu">
                    <Link href="/admin" className="nav-subitem" onClick={closeMenu}>
                      Admin Panel
                    </Link>
                    <Link href="/admin/content" className="nav-subitem" onClick={closeMenu}>
                      Create Content
                    </Link>
                  </div>
                </details>
              )}

              <button
                type="button"
                className="nav-btn"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                Logout
              </button>
            </>
          )}

          {!session && (
            <Link href="/login" className="nav-item" onClick={closeMenu}>Login</Link>
          )}
        </div>
      </div>

      <style jsx>{`
        .nav-inner {
          position: relative;
        }

        .nav-logo {
          display: inline-flex;
          min-width: 0;
          align-items: center;
          gap: 9px;
          line-height: 1.15;
        }

        .nav-logo span {
          display: block;
        }

        .nav-favicon {
          width: 34px;
          height: 34px;
          flex: 0 0 auto;
        }

        .nav-item,
        .nav-group-toggle {
          padding: 8px 10px;
          border-radius: 7px;
        }

        .nav-item:hover,
        .nav-group-toggle:hover {
          background: #21262d;
        }

        .nav-group {
          position: relative;
          color: #c9d1d9;
        }

        .nav-group-toggle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          list-style: none;
          font-weight: 500;
          cursor: pointer;
          user-select: none;
        }

        .nav-group-toggle::-webkit-details-marker {
          display: none;
        }

        .nav-chevron {
          transition: transform 0.15s ease;
        }

        .nav-group[open] .nav-chevron {
          transform: rotate(180deg);
        }

        .nav-submenu {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          z-index: 4;
          display: none;
          min-width: 190px;
          padding: 7px;
          border: 1px solid #30363d;
          border-radius: 9px;
          background: #161b22;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.42);
        }

        .nav-group[open] > .nav-submenu {
          display: grid;
          gap: 3px;
        }

        .nav-subitem {
          padding: 10px 11px;
          border-radius: 6px;
          color: #c9d1d9;
          text-decoration: none;
          white-space: nowrap;
        }

        .nav-subitem:hover {
          background: #21262d;
          color: #fff;
        }

        .nav-toggle,
        .nav-backdrop {
          display: none;
        }

        @media (max-width: 700px) {
          .nav-inner {
            min-height: 44px;
          }

          .nav-logo {
            max-width: calc(100% - 58px);
            font-size: 17px;
          }

          .nav-logo span {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .nav-favicon {
            width: 32px;
            height: 32px;
          }

          .nav-toggle {
            position: relative;
            z-index: 5;
            display: inline-flex;
            width: 44px !important;
            height: 44px;
            flex: 0 0 44px;
            align-items: center;
            justify-content: center;
            margin-left: 8px;
            padding: 0;
            border: 1px solid transparent;
            border-radius: 8px;
            font-size: 29px;
            line-height: 1;
          }

          .nav-toggle:hover {
            border-color: #30363d;
            background: #21262d;
          }

          .nav-backdrop.open {
            position: fixed;
            inset: 0;
            z-index: 1;
            display: block;
            width: 100% !important;
            padding: 0;
            border: 0;
            border-radius: 0;
            background: rgba(1, 4, 9, 0.62);
          }

          .nav-links {
            position: absolute;
            top: calc(100% + 9px);
            right: 0;
            z-index: 3;
            display: none;
            width: min(330px, calc(100vw - 24px));
            max-height: calc(100dvh - 78px);
            margin: 0;
            padding: 9px;
            overflow-y: auto;
            flex-direction: column;
            align-items: stretch;
            gap: 3px;
            border: 1px solid #30363d;
            border-radius: 11px;
            background: #161b22;
            box-shadow: 0 18px 45px rgba(0, 0, 0, 0.55);
          }

          .nav-links.open {
            display: flex;
          }

          .nav-item,
          .nav-group-toggle {
            width: 100%;
            padding: 12px 13px;
            text-align: left;
          }

          .nav-group {
            width: 100%;
          }

          .nav-submenu {
            position: static;
            min-width: 0;
            margin: 2px 5px 6px 13px;
            padding: 4px 0 4px 9px;
            border: 0;
            border-left: 2px solid #30363d;
            border-radius: 0;
            background: transparent;
            box-shadow: none;
          }

          .nav-subitem {
            padding: 10px 12px;
            white-space: normal;
          }

          .nav-btn {
            width: 100% !important;
            margin-top: 5px;
            padding: 11px 13px;
          }
        }
      `}</style>
    </nav>
  );
}
