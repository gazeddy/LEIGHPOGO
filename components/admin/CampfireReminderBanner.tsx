import Link from "next/link";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

interface ReminderPayload {
  count: number;
  events: Array<{
    eventID: string;
    name: string;
  }>;
  error?: string;
}

export default function CampfireReminderBanner() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [payload, setPayload] = useState<ReminderPayload | null>(null);

  const isAdmin =
    status === "authenticated" &&
    (session?.user as { role?: string } | undefined)?.role === "admin";
  const isAdminArea =
    router.pathname === "/admin" || router.pathname.startsWith("/admin/");

  useEffect(() => {
    if (!isAdmin || !isAdminArea || router.pathname === "/admin/campfire-reminders") {
      setPayload(null);
      return;
    }

    let cancelled = false;

    void fetch("/api/admin/campfire-reminders")
      .then(async (response) => {
        const body = (await response.json()) as ReminderPayload;
        if (!response.ok) throw new Error(body.error || "Reminder lookup failed");
        if (!cancelled) setPayload(body);
      })
      .catch(() => {
        if (!cancelled) setPayload(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isAdmin, isAdminArea, router.pathname]);

  if (!payload) return null;

  const isClear = payload.count === 0;
  if (isClear && router.pathname !== "/admin") return null;

  const preview = payload.events.slice(0, 2).map((event) => event.name).join(" · ");
  const extra = Math.max(0, payload.count - 2);

  return (
    <aside
      className={`campfire-admin-reminder${isClear ? " clear" : " attention"}`}
      role="status"
    >
      <div>
        <strong>
          {isClear
            ? "Campfire reminders clear"
            : `${payload.count} event${payload.count === 1 ? "" : "s"} need a Campfire meetup`}
        </strong>
        {!isClear && preview && (
          <span>
            {preview}{extra > 0 ? ` · +${extra} more` : ""}
          </span>
        )}
        {isClear && <span>No configured upcoming events are missing a meetup.</span>}
      </div>
      <Link href="/admin/campfire-reminders">
        {isClear ? "Configure" : "Review reminders"}
      </Link>

      <style jsx>{`
        .campfire-admin-reminder {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin: 12px auto 0;
          width: min(1180px, calc(100% - 32px));
          box-sizing: border-box;
          padding: 12px 14px;
          border-radius: 10px;
        }

        .campfire-admin-reminder.attention {
          border: 1px solid #d29922;
          background: rgba(210, 153, 34, 0.14);
          color: #f2cc60;
        }

        .campfire-admin-reminder.clear {
          border: 1px solid #238636;
          background: rgba(35, 134, 54, 0.12);
          color: #7ee787;
        }

        div {
          display: grid;
          gap: 3px;
          min-width: 0;
        }

        .attention strong {
          color: #f2cc60;
        }

        .clear strong {
          color: #7ee787;
        }

        span {
          overflow: hidden;
          color: #c9d1d9;
          font-size: 0.82rem;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        a {
          flex: 0 0 auto;
          padding: 7px 10px;
          border-radius: 7px;
          font-size: 0.8rem;
          font-weight: 800;
          text-decoration: none;
        }

        .attention a {
          border: 1px solid #d29922;
          color: #f2cc60;
        }

        .clear a {
          border: 1px solid #238636;
          color: #7ee787;
        }

        a:hover,
        a:focus-visible {
          background: rgba(255, 255, 255, 0.06);
        }

        @media (max-width: 650px) {
          .campfire-admin-reminder {
            align-items: stretch;
            flex-direction: column;
          }

          span {
            white-space: normal;
          }

          a {
            text-align: center;
          }
        }
      `}</style>
    </aside>
  );
}