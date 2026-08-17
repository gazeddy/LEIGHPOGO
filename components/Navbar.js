import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";

const syncAppBadge = async (unreadCount) => {
  if (typeof navigator === "undefined") return;

  const count = Math.max(0, Number(unreadCount) || 0);

  try {
    if (count > 0) {
      if (typeof navigator.setAppBadge === "function") {
        await navigator.setAppBadge(count);
      }
      return;
    }

    if (typeof navigator.clearAppBadge === "function") {
      await navigator.clearAppBadge();
    } else if (typeof navigator.setAppBadge === "function") {
      await navigator.setAppBadge(0);
    }
  } catch {
    // App badging is an enhancement; unsupported or denied badges must not break navigation.
  }
};

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
      void syncAppBadge(0);
      return undefined;
    }

    let isActive = true;

    const loadUnreadNotifications = async () => {
      try {
        const response = await fetch("/api/notifications?summary=1");
        if (!response.ok) return;
        const data = await response.json();
        const unreadCount = Number(data.unreadCount) || 0;

        if (isActive) {
          setUnreadNotifications(unreadCount);
          void syncAppBadge(unreadCount);
        }
      } catch {
        // Keep navigation usable if the notification endpoint is temporarily unavailable.
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadUnreadNotifications();
      }
    };

    void loadUnreadNotifications();
    const interval = window.setInterval(loadUnreadNotifications, 60_000);
    router.events.on("routeChangeComplete", loadUnreadNotifications);
    window.addEventListener("focus", loadUnreadNotifications);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("trade-notifications-updated", loadUnreadNotifications);

    return () => {
      isActive = false;
      window.clearInterval(interval);
      router.events.off("routeChangeComplete", loadUnreadNotifications);
      window.removeEventListener("focus", loadUnreadNotifications);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
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
    setUnreadNotifications(0);
    void syncAppBadge(0);
    signOut({ callbackUrl: "/login" });
  };

  return (
    <nav className="navbar" aria-label="Main navigation">
      <div className="nav-inner">
        <Link href="/" className="nav-logo">
          <Image
            src="/pwa-icon-192.png"
            width={32}
            height={32}
            alt=""
            aria-hidden="true"
            className="nav-favicon"
          />
          <span>Leigh Pokemon Go Community</span>
        </Link>

        {session && (
          <Link
            href="/gyms?add=1#add-gym"
            className="app-new-gym-shortcut"
            aria-label="Add a new gym"
          >
            ＋ Gym
          </Link>
        )}

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

          <div className={`nav-group nav-tools-dropdown ${toolsOpen ? "open" : ""}`}>
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
              <Link href="/tools/raids" className="nav-item nav-subitem">Raids</Link>
              <Link href="/search-strings" className="nav-item nav-subitem">Search Builder</Link>
              <Link href="/pokedex" className="nav-item nav-subitem">Pokédex</Link>
              {session && (
                <>
                  <Link href="/gyms" className="nav-item nav-subitem">Gym Map</Link>
                  <Link href="/trades" className="nav-item nav-subitem">Trades</Link>
                  <Link href="/trades/wanted" className="nav-item nav-subitem">Wanted Trades</Link>
                </>
              )}
            </div>
          </div>

          <div className="app-tools-panel" aria-label="Quick tools">
            <div className="app-tools-title">Quick tools</div>
            <div className="app-tools-grid">
              {session && (
                <Link href="/gyms?add=1#add-gym" className="app-tool-card app-tool-card-primary">
                  <span className="app-tool-symbol" aria-hidden="true">＋</span>
                  <span><strong>New Gym</strong><small>Add with GPS</small></span>
                </Link>
              )}
              {session && (
                <Link href="/gyms" className="app-tool-card">
                  <span className="app-tool-symbol" aria-hidden="true">⌖</span>
                  <span><strong>Gym Map</strong><small>Find nearby gyms</small></span>
                </Link>
              )}
              <Link href="/tools/raids" className="app-tool-card">
                <span className="app-tool-symbol" aria-hidden="true">⚔</span>
                <span><strong>Raids</strong><small>Boss counters</small></span>
              </Link>
              <Link href="/search-strings" className="app-tool-card">
                <span className="app-tool-symbol" aria-hidden="true">⌕</span>
                <span><strong>Search</strong><small>Build search strings</small></span>
              </Link>
              <Link href="/pokedex" className="app-tool-card">
                <span className="app-tool-symbol" aria-hidden="true">◉</span>
                <span><strong>Pokédex</strong><small>Track your dex</small></span>
              </Link>
              <Link href="/friend-codes" className="app-tool-card">
                <span className="app-tool-symbol" aria-hidden="true">＋</span>
                <span><strong>Friend Codes</strong><small>Copy trainer codes</small></span>
              </Link>
              {session && (
                <Link href="/trades" className="app-tool-card">
                  <span className="app-tool-symbol" aria-hidden="true">⇄</span>
                  <span><strong>Trades</strong><small>Community listings</small></span>
                </Link>
              )}
              {session && (
                <Link href="/trades/wanted" className="app-tool-card">
                  <span className="app-tool-symbol" aria-hidden="true">☆</span>
                  <span><strong>Wanted</strong><small>Your wanted trades</small></span>
                </Link>
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
                    <Link href="/admin" className="nav-item nav-subitem">Admin Panel</Link>
                    <Link href="/admin/usage" className="nav-item nav-subitem">Usage</Link>
                    <Link href="/admin/pokedex" className="nav-item nav-subitem">Pokédex Availability</Link>
                    <Link href="/admin/events" className="nav-item nav-subitem">Event Feed</Link>
                    <Link href="/admin/event-types" className="nav-item nav-subitem">Event Types</Link>
                    <Link href="/admin/content" className="nav-item nav-subitem">Guide Creator / Editor</Link>
                    <Link href="/admin/gyms" className="nav-item nav-subitem">Gym Data</Link>
                    <Link href="/admin/gym-removals" className="nav-item nav-subitem">Gym Removals</Link>
                  </div>
                </div>
              )}

              <button type="button" className="nav-btn" onClick={handleLogout}>Logout</button>
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
