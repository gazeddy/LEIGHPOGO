import { useState } from "react";
import styles from "./ReportGymRemovedButton.module.css";

interface ReportGymRemovedButtonProps {
  gymId: string;
  gymName: string;
}

interface ReportResponse {
  error?: string;
  message?: string;
}

export default function ReportGymRemovedButton({
  gymId,
  gymName,
}: ReportGymRemovedButtonProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reportRemoved() {
    if (
      !window.confirm(
        `Report “${gymName}” as removed? It will remain on the map until an administrator approves the report.`,
      )
    ) {
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/gyms/report-removed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gymId }),
      });
      const payload = (await response.json()) as ReportResponse;

      if (!response.ok) {
        throw new Error(payload.error || "The removal report could not be submitted.");
      }

      setSubmitted(true);
      setMessage(
        payload.message || "Removal reported. An administrator will review it.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The removal report could not be submitted.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.reportControl}>
      <button
        type="button"
        className={styles.reportButton}
        onClick={reportRemoved}
        disabled={submitting || submitted}
      >
        {submitting
          ? "Reporting…"
          : submitted
            ? "Removal reported"
            : "Report gym as removed"}
      </button>
      {message && <small className={styles.success}>{message}</small>}
      {error && <small className={styles.error}>{error}</small>}
    </div>
  );
}
