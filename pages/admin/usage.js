import Head from "next/head"
import Link from "next/link"
import { getServerSession } from "next-auth/next"
import { authOptions } from "../api/auth/[...nextauth]"
import prisma from "../../lib/prisma"
import { USAGE_EVENT_LABELS } from "../../lib/usageEventTypes"

const RANGE_OPTIONS = [
  { days: 1, label: "24 hours" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
]

const deviceLabel = (device) => {
  if (device === "mobile") return "Mobile"
  if (device === "tablet") return "Tablet"
  return "Desktop"
}

const formatEvent = (type) => USAGE_EVENT_LABELS[type] || type

export default function UsageAdmin({
  days,
  totalEvents,
  activeMembers,
  topAction,
  topDevice,
  eventCounts,
  deviceCounts,
  dailyCounts,
  recentEvents,
}) {
  return (
    <>
      <Head>
        <title>Usage | LEIGHPOGO Admin</title>
      </Head>
      <div className="container usage-admin">
        <div className="card usage-header">
          <div>
            <p><Link href="/admin">← Admin panel</Link></p>
            <h1>Feature usage</h1>
            <p className="muted">
              Logged-in member actions only. No IP addresses or full browser user-agent strings are stored here. Use Cloudflare for visits, page views and anonymous traffic.
            </p>
          </div>
          <div className="usage-range" aria-label="Usage reporting range">
            {RANGE_OPTIONS.map((option) => (
              <Link
                key={option.days}
                href={`/admin/usage?days=${option.days}`}
                className={`button-link secondary-button${days === option.days ? " active" : ""}`}
              >
                {option.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="usage-summary-grid">
          <div className="card usage-summary">
            <span className="muted">Feature actions</span>
            <strong>{totalEvents}</strong>
          </div>
          <div className="card usage-summary">
            <span className="muted">Active members</span>
            <strong>{activeMembers}</strong>
          </div>
          <div className="card usage-summary">
            <span className="muted">Top action</span>
            <strong>{topAction ? formatEvent(topAction.type) : "—"}</strong>
            {topAction && <small>{topAction.count} uses</small>}
          </div>
          <div className="card usage-summary">
            <span className="muted">Top device</span>
            <strong>{topDevice ? deviceLabel(topDevice.device) : "—"}</strong>
            {topDevice && <small>{topDevice.count} actions</small>}
          </div>
        </div>

        <div className="usage-grid">
          <section className="card">
            <h2>Actions</h2>
            {eventCounts.length === 0 ? (
              <p className="muted">No feature activity in this period yet.</p>
            ) : (
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th>Uses</th>
                  </tr>
                </thead>
                <tbody>
                  {eventCounts.map((entry) => (
                    <tr key={entry.type}>
                      <td>{formatEvent(entry.type)}</td>
                      <td>{entry.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card">
            <h2>Device mix</h2>
            {deviceCounts.length === 0 ? (
              <p className="muted">No device data yet.</p>
            ) : (
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>Device</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deviceCounts.map((entry) => (
                    <tr key={entry.device}>
                      <td>{deviceLabel(entry.device)}</td>
                      <td>{entry.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <section className="card">
          <h2>Daily activity</h2>
          {dailyCounts.length === 0 ? (
            <p className="muted">No activity to show yet.</p>
          ) : (
            <table className="usage-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Feature actions</th>
                </tr>
              </thead>
              <tbody>
                {dailyCounts.map((entry) => (
                  <tr key={entry.date}>
                    <td>{entry.date}</td>
                    <td>{entry.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <h2>Recent member activity</h2>
          {recentEvents.length === 0 ? (
            <p className="muted">No recent feature activity.</p>
          ) : (
            <div className="usage-table-wrap">
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Member</th>
                    <th>Action</th>
                    <th>Device</th>
                    <th>Page</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.map((event) => (
                    <tr key={event.id}>
                      <td>{new Date(event.createdAt).toLocaleString("en-GB")}</td>
                      <td>{event.ownerIgn || "Deleted member"}</td>
                      <td>{formatEvent(event.type)}</td>
                      <td>{deviceLabel(event.device)}</td>
                      <td><code>{event.path || "—"}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <style jsx>{`
          .usage-admin {
            padding-bottom: 32px;
          }
          .usage-header {
            display: flex;
            justify-content: space-between;
            gap: 20px;
            align-items: flex-start;
          }
          .usage-header h1 {
            margin-top: 0;
          }
          .usage-range {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
          }
          .usage-range :global(.active) {
            border-color: #58a6ff;
          }
          .usage-summary-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 14px;
            margin: 14px 0;
          }
          .usage-summary {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
          .usage-summary strong {
            font-size: 1.6rem;
          }
          .usage-summary small {
            color: #8b949e;
          }
          .usage-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 14px;
            margin-bottom: 14px;
          }
          .usage-table-wrap {
            overflow-x: auto;
          }
          .usage-table {
            width: 100%;
            border-collapse: collapse;
          }
          .usage-table th,
          .usage-table td {
            padding: 9px 8px;
            text-align: left;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            vertical-align: top;
          }
          .usage-table th {
            font-weight: 800;
          }
          @media (max-width: 900px) {
            .usage-header {
              flex-direction: column;
            }
            .usage-summary-grid,
            .usage-grid {
              grid-template-columns: 1fr 1fr;
            }
          }
          @media (max-width: 600px) {
            .usage-summary-grid,
            .usage-grid {
              grid-template-columns: 1fr;
            }
          }
        `}</style>
      </div>
    </>
  )
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions)

  if (!session || session.user.role !== "admin") {
    return {
      redirect: { destination: "/login", permanent: false },
    }
  }

  const requestedDays = Number(Array.isArray(context.query.days) ? context.query.days[0] : context.query.days)
  const days = [1, 7, 30].includes(requestedDays) ? requestedDays : 7
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const events = await prisma.usageEvent.findMany({
    where: { createdAt: { gte: since } },
    include: {
      owner: {
        select: { ign: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  const eventMap = new Map()
  const deviceMap = new Map()
  const dayMap = new Map()
  const memberIds = new Set()
  const dayFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })

  for (const event of events) {
    eventMap.set(event.type, (eventMap.get(event.type) || 0) + 1)
    deviceMap.set(event.device || "desktop", (deviceMap.get(event.device || "desktop") || 0) + 1)
    dayMap.set(dayFormatter.format(event.createdAt), (dayMap.get(dayFormatter.format(event.createdAt)) || 0) + 1)
    if (event.ownerId) memberIds.add(event.ownerId)
  }

  const eventCounts = Array.from(eventMap, ([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
  const deviceCounts = Array.from(deviceMap, ([device, count]) => ({ device, count }))
    .sort((a, b) => b.count - a.count)
  const dailyCounts = Array.from(dayMap, ([date, count]) => ({ date, count }))

  return {
    props: {
      days,
      totalEvents: events.length,
      activeMembers: memberIds.size,
      topAction: eventCounts[0] || null,
      topDevice: deviceCounts[0] || null,
      eventCounts,
      deviceCounts,
      dailyCounts,
      recentEvents: events.slice(0, 50).map((event) => ({
        id: event.id,
        type: event.type,
        path: event.path,
        device: event.device || "desktop",
        ownerIgn: event.owner?.ign || null,
        createdAt: event.createdAt.toISOString(),
      })),
    },
  }
}
