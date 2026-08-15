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
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    const closeNavigation = () => {
      setOpen(false);
      setToolsOpen(false);
      setAdminOpen(false);
    };

    router.events.on("routeChangeStart", closeNavigation);
    return () => router.events.off("routeChangeStart", closeNavigation);
  }, [router.events]);

  useEffect(() => {
    if (!session?.user?.id) {
      setUnreadNotifications(0);
      return undefined;
    }

    let isActive = true;

    const loadUnreadNotifications = async () => {
      try {
        const response = await fetch("/api/notifications?summary=1");
        if (!response.ok) return;
        const data = await response.json();
        if (isActive) setUnreadNotifications(Number(data.unreadCount) || 0);
      } catch {
        // Keep navigation usable if the notification endpoint is temporarily unavailable.
      }
    };

    loadUnreadNotifications();
    const interval = window.setInterval(loadUnreadNotifications, 60_000);
    router.events.on("routeChangeComplete", loadUnreadNotifications);
    window.addEventListener("trade-notifications-updated", loadUnreadNotifications);

    return () => {
      isActive = false;
      window.clearInterval(interval);
      router.events.off("routeChangeComplete", loadUnreadNotifications);
      window.removeEventListener("trade-notifications-updated", loadUnreadNotifications);
    };
  }, [router.events, session?.user?.id]);

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
          <Link href="/" className="nav-item nav-main-item">Home</Link>
          <Link href="/events" className="nav-item nav-main-item">Events</Link>
          <Link href="/guides" className="nav-item nav-main-item">Guides</Link>

          <div className={`nav-group ${toolsOpen ? "open" : ""}`}>
            <button
              type="button"
              className="nav-item nav-main-item nav-group-toggle"
              aria-expanded={toolsOpen}
              aria-controls="tools-navigation"
              onClick={toggleTools}
            >
              <span>Tools</span>
              <span className="nav-caret" aria-hidden="true" />
            </button>
            <div id="tools-navigation" className="nav-submenu">
              <Link href="/tools/raids" className="nav-item nav-subitem">
                Raids
              </Link>
              <Link href="/search-strings" className="nav-item nav-subitem">
                Search Builder
              </Link>
              <Link href="/pokedex" className="nav-item nav-subitem">
                Pokédex
              </Link>
              {session && (
                <>
                  <Link href="/gyms" className="nav-item nav-subitem">
                    Gym Map
                  </Link>
                  <Link href="/trades" className="nav-item nav-subitem">
                    Trades
                  </Link>
                  <Link href="/trades/wanted" className="nav-item nav-subitem">
                    Wanted Trades
                  </Link>
                </>
              )}
            </div>
          </div>

          {session && (
            <>
              <Link href="/account" className="nav-item nav-main-item">Account</Link>
              <Link href="/notifications" className="nav-item nav-main-item nav-notifications">
                <span>Notifications</span>
                {unreadNotifications > 0 && (
                  <span className="nav-notification-count" aria-label={`${unreadNotifications} unread notifications`}>
                    {unreadNotifications > 99 ? "99+" : unreadNotifications}
                  </span>
                )}
              </Link>

              {isAdmin && (
                <div className={`nav-group nav-group-admin ${adminOpen ? "open" : ""}`}>
                  <button
                    type="button"
                    className="nav-item nav-main-item nav-group-toggle"
                    aria-expanded={adminOpen}
                    aria-controls="admin-navigation"
                    onClick={toggleAdmin}
                  >
                    <span>Admin</span>
                    <span className="nav-caret" aria-hidden="true" />
                  </button>
                  <div id="admin-navigation" className="nav-submenu">
                    <Link href="/admin" className="nav-item nav-subitem">
                      Admin Panel
                    </Link>
                    <Link href="/admin/pokedex" className="nav-item nav-subitem">
                      Pokédex Availability
                    </Link>
                    <Link href="/admin/events" className="nav-item nav-subitem">
                      Event Feed
                    </Link>
                    <Link href="/admin/event-types" className="nav-item nav-subitem">
                      Event Types
                    </Link>
                    <Link href="/admin/content" className="nav-item nav-subitem">
                      Guide Creator / Editor
                    </Link>
                    <Link href="/admin/gyms" className="nav-item nav-subitem">
                      Gym Data
                    </Link>
                    <Link href="/admin/gym-removals" className="nav-item nav-subitem">
                      Gym Removals
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
            <Link href="/login" className="nav-item nav-main-item">Login</Link>
          )}
        </div>
      </div>
    </nav>
  );
}
