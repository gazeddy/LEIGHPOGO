import Head from "next/head";
import Link from "next/link";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import { useState } from "react";
import {
  readGymState,
  type GymRemovalReport,
} from "../../lib/gyms";
import styles from "../../styles/GymRemovalAdmin.module.css";
import { authOptions } from "../api/auth/[...nextauth]";

interface GymRemovalAdminProps {
  initialReports: GymRemovalReport[];
}

interface ReviewResponse {
  error?: string;
  message?: string;
}

export const getServerSideProps: GetServerSideProps<GymRemovalAdminProps> = async (
  context,
) => {
  const session = await getServerSession(
    context.req,
    context.res,
    authOptions as NextAuthOptions,
  );

  if ((session?.user as { role?: string } | undefined)?.role !== "admin") {
    return {
      redirect: { destination: "/login", permanent: false },
    };
  }

  const state = await readGymState();

  return {
    props: {
      initialReports: state.removalReports
        .filter((report) => report.status === "pending")
        .sort((left, right) => left.reportedAt.localeCompare(right.reportedAt)),
    },
  };
};

export default function GymRemovalAdminPage({
  initialReports,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [reports, setReports] = useState(initialReports);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reviewReport(
    report: GymRemovalReport,
    decision: "approve" | "reject",
  ) {
    if (
      decision === "approve" &&
      !window.confirm(
        `Approve removal of “${report.gymName}”? The gym will disappear from the map and remain suppressed during later CSV imports.`,
      )
    ) {
      return;
    }

    setReviewingId(report.id);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/gyms/removal-reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: report.id, decision }),
      });
      const payload = (await response.json()) as ReviewResponse;

      if (!response.ok) {
        throw new Error(payload.error || "The removal report could not be reviewed.");
      }

      setReports((current) => current.filter((item) => item.id !== report.id));
      setMessage(
        payload.message ||
          (decision === "approve"
            ? "Removal approved."
            : "Removal report rejected."),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The removal report could not be reviewed.",
      );
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <>
      <Head>
        <title>Gym Removal Reports | Leigh Pokémon Go Admin</title>
      </Head>
      <main className={`container ${styles.page}`}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Admin tools</p>
            <h1>Gym removal reports</h1>
            <p>
              Review reports from members. A gym stays visible until you approve
              its removal.
            </p>
          </div>
          <div className={styles.links}>
            <Link href="/gyms">Open gym map</Link>
            <Link href="/admin/gyms">Gym data</Link>
            <Link href="/admin">Back to admin</Link>
          </div>
        </header>

        {message && <p className={styles.success}>{message}</p>}
        {error && <p className={styles.error}>{error}</p>}

        <section className={styles.card}>
          <div className={styles.cardHeading}>
            <div>
              <h2>Pending review</h2>
              <p>{reports.length} report{reports.length === 1 ? "" : "s"} waiting.</p>
            </div>
          </div>

          {reports.length === 0 ? (
            <p className={styles.empty}>There are no pending gym removal reports.</p>
          ) : (
            <div className={styles.reportList}>
              {reports.map((report) => (
                <article key={report.id} className={styles.report}>
                  <div className={styles.reportDetails}>
                    <strong>{report.gymName}</strong>
                    <small>Gym ID: {report.gymId}</small>
                    <small>
                      Reported by {report.reportedByIgn || "a member"} on{" "}
                      {new Date(report.reportedAt).toLocaleString("en-GB")}
                    </small>
                    <Link href={`/gyms?gym=${encodeURIComponent(report.gymId)}`}>
                      View gym on map
                    </Link>
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.approve}
                      disabled={reviewingId === report.id}
                      onClick={() => reviewReport(report, "approve")}
                    >
                      {reviewingId === report.id ? "Reviewing…" : "Approve removal"}
                    </button>
                    <button
                      type="button"
                      className={styles.reject}
                      disabled={reviewingId === report.id}
                      onClick={() => reviewReport(report, "reject")}
                    >
                      Reject report
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
