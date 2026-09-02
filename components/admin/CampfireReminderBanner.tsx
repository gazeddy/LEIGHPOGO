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
  const isAdminArea = router.pathname === "/admin" || router.pathname.startsWith("/admin/");

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

  if (!payload || payload.count === 0) return null;

  const preview = payload.events.slice(0, 2).map((event) => event.name).join(" · ");
  const extra = Math.max(0, payload.count - 2);

  return (
    <aside className="campfire-admin-reminder" role="status">
      <div>
        <strong>
          {payload.count} event{payload.count === 1 ? "" : "s"} need a Campfire meetup
        </strong>
        {preview && (
          <span>
            {preview}{extra > 0 ? ` · +${extra} more` : ""}
          </span>
        )}
      </div>
      <Link href="/admin/campfire-reminders">Review reminders</Link>

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
          border: 1px solid #d29922;
          border-radius: 10px;
          background: rgba(210, 153, 34, 0.14);
          color: #f2cc60;
        }

        div {
          display: grid;
          gap: 3px;
          min-width: 0;
        }

        strong {
          color: #f2cc60;
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
          border: 1px solid #d29922;
          border-radius: 7px;
          color: #f2cc60;
          font-size: 0.8rem;
          font-weight: 800;
          text-decoration: none;
        }

        a:hover,
        a:focus-visible {
          background: rgba(210, 153, 34, 0.16);
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
