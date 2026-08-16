import Link from "next/link";
import Head from "next/head";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import { useMemo, useState, type ChangeEvent } from "react";
import {
  latestGymStateBackup,
  type GymStateBackupInfo,
} from "../../lib/gym-backups";
import { readGymState, sortGyms, type GymRecord } from "../../lib/gyms";
import { authOptions } from "../api/auth/[...nextauth]";

const MAX_CSV_SIZE = 5 * 1024 * 1024;

type MaintenanceAction = "clear-new" | "rollback";

interface GymAdminProps {
  initialGyms: GymRecord[];
  importedAt: string | null;
  sourceFile: string | null;
  latestBackup: GymStateBackupInfo | null;
}

interface ImportResponse {
  error?: string;
  message?: string;
  summary?: {
    total: number;
    added: number;
    updated: number;
    removed: number;
    unchanged: number;
    sourceFile: string;
  };
}

interface MaintenanceResponse {
  error?: string;
  message?: string;
  total?: number;
  importedAt?: string | null;
  sourceFile?: string | null;
  backupFile?: string | null;
  restoredFile?: string;
}

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("The CSV could not be read."));
    reader.onerror = () => reject(new Error("The CSV could not be read."));
    reader.readAsDataURL(file);
  });
}

export const getServerSideProps: GetServerSideProps<GymAdminProps> = async (
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

  const [state, latestBackup] = await Promise.all([
    readGymState(),
    latestGymStateBackup(),
  ]);

  return {
    props: {
      initialGyms: sortGyms(state.gyms),
      importedAt: state.importedAt,
      sourceFile: state.sourceFile,
      latestBackup,
    },
  };
};

export default function GymAdminPage({
  initialGyms,
  importedAt,
  sourceFile,
  latestBackup,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [gyms, setGyms] = useState(initialGyms);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [maintenanceAction, setMaintenanceAction] =
    useState<MaintenanceAction | null>(null);
  const [search, setSearch] = useState("");
  const [aliasDrafts, setAliasDrafts] = useState<Record<string, string>>({});
  const [markerEmojiDrafts, setMarkerEmojiDrafts] = useState<Record<string, string>>({});
  const [savingDisplay, setSavingDisplay] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredGyms = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return gyms;
    }

    return gyms.filter((gym) =>
      [gym.name, gym.alias || "", gym.id].some((value) =>
        value.toLowerCase().includes(term),
      ),
    );
  }, [gyms, search]);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setMessage(null);
    setError(null);
  }

  async function uploadCsv() {
    setMessage(null);
    setError(null);

    if (!file) {
      setError("Choose a gym CSV first.");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("The selected file must be a CSV.");
      return;
    }

    if (file.size === 0 || file.size > MAX_CSV_SIZE) {
      setError("Gym CSV files must be between 1 byte and 5 MB.");
      return;
    }

    setUploading(true);

    try {
      const dataUrl = await fileAsDataUrl(file);
      const response = await fetch("/api/admin/gyms/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, dataUrl }),
      });
      const payload = (await response.json()) as ImportResponse;

      if (!response.ok || !payload.summary) {
        throw new Error(payload.error || "The gym CSV could not be imported.");
      }

      const summary = payload.summary;
      setMessage(
        `${payload.message} ${summary.total} gyms loaded; ${summary.added} added, ` +
          `${summary.updated} updated and ${summary.removed} removed. Archived as ${summary.sourceFile}.`,
      );
      setFile(null);

      window.setTimeout(() => window.location.reload(), 1200);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The gym CSV could not be imported.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function runMaintenance(action: MaintenanceAction) {
    const confirmation =
      action === "clear-new"
        ? "Clear the new-gym status from every gym? This does not delete gyms, aliases or custom icons, and a recovery backup will be created first."
        : `Restore the latest gym-state backup${latestBackup ? ` (${latestBackup.fileName})` : ""}? The current state will also be backed up so this rollback can be undone.`;

    if (!window.confirm(confirmation)) {
      return;
    }

    setMessage(null);
    setError(null);
    setMaintenanceAction(action);

    try {
      const response = await fetch("/api/admin/gyms/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as MaintenanceResponse;

      if (!response.ok || !payload.message) {
        throw new Error(payload.error || "The gym maintenance action failed.");
      }

      setMessage(payload.message);
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The gym maintenance action failed.",
      );
    } finally {
      setMaintenanceAction(null);
    }
  }

  async function saveDisplaySettings(gym: GymRecord) {
    setMessage(null);
    setError(null);
    setSavingDisplay(gym.id);

    try {
      const alias = aliasDrafts[gym.id] ?? gym.alias ?? "";
      const markerEmoji = markerEmojiDrafts[gym.id] ?? gym.markerEmoji ?? "";
      const response = await fetch("/api/admin/gyms/alias", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: gym.id, alias, markerEmoji }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.gym) {
        throw new Error(payload.error || "The gym display settings could not be saved.");
      }

      setGyms((current) =>
        current.map((item) => (item.id === gym.id ? payload.gym : item)),
      );
      setAliasDrafts((current) => {
        const next = { ...current };
        delete next[gym.id];
        return next;
      });
      setMarkerEmojiDrafts((current) => {
        const next = { ...current };
        delete next[gym.id];
        return next;
      });
      setMessage(payload.message);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The gym display settings could not be saved.",
      );
    } finally {
      setSavingDisplay(null);
    }
  }

  return (
    <>
      <Head>
        <title>Gym Data | Leigh Pokémon Go Admin</title>
      </Head>
      <main className="container gym-admin-page">
        <header className="gym-admin-header">
          <div>
            <p className="eyebrow">Admin tools</p>
            <h1>Gym data</h1>
            <p>Import the current gym export and manage community aliases and custom map icons.</p>
          </div>
          <div className="header-links">
            <Link href="/gyms">Open gym map</Link>
            <Link href="/admin">Back to admin</Link>
          </div>
        </header>

        {message && <p className="gym-notice success">{message}</p>}
        {error && <p className="gym-notice error">{error}</p>}

        <section className="gym-admin-card uploader-card">
          <div>
            <h2>Upload gym CSV</h2>
            <p>
              Accepted uploads are archived under <code>data/gym-imports</code> using UK
              local time in the format <code>YYYY-MM-DD HH-mm-ss - gyms.csv</code>.
            </p>
            <p className="muted">
              The first upload is treated as the baseline. Later uploads preserve aliases
              and custom map icons, and mark previously unseen gym IDs as new for seven
              days. The complete gym state is backed up before every import.
            </p>
          </div>
          <div className="upload-controls">
            <input type="file" accept=".csv,text/csv" onChange={chooseFile} />
            <button type="button" onClick={uploadCsv} disabled={uploading}>
              {uploading ? "Importing…" : "Upload and import"}
            </button>
          </div>
          <dl className="import-status">
            <div><dt>Current gyms</dt><dd>{gyms.length}</dd></div>
            <div><dt>Last upload</dt><dd>{importedAt ? new Date(importedAt).toLocaleString("en-GB") : "None"}</dd></div>
            <div><dt>Archive file</dt><dd>{sourceFile || "None"}</dd></div>
          </dl>
        </section>

        <section className="gym-admin-card uploader-card">
          <div>
            <h2>Recovery tools</h2>
            <p>
              Clear all new-gym indicators without deleting gym records, or restore the
              complete gym state from the latest recovery point.
            </p>
            <p className="muted">
              Rollback includes official gyms, community-added gyms, aliases, custom map
              icons and removal reports. The state being replaced is backed up first, so a
              rollback can be reversed by running rollback again.
            </p>
          </div>
          <div className="upload-controls">
            <button
              type="button"
              disabled={maintenanceAction !== null}
              onClick={() => runMaintenance("clear-new")}
            >
              {maintenanceAction === "clear-new" ? "Clearing…" : "Clear all new flags"}
            </button>
            <button
              type="button"
              disabled={maintenanceAction !== null || !latestBackup}
              onClick={() => runMaintenance("rollback")}
            >
              {maintenanceAction === "rollback" ? "Restoring…" : "Roll back previous update"}
            </button>
          </div>
          <dl className="import-status">
            <div>
              <dt>Latest recovery point</dt>
              <dd>{latestBackup?.fileName || "None yet"}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>
                {latestBackup
                  ? new Date(latestBackup.createdAt).toLocaleString("en-GB")
                  : "A backup is created before the next import or clear action"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="gym-admin-card alias-card">
          <div className="alias-heading">
            <div>
              <h2>Community display settings</h2>
              <p className="muted">
                Set an optional alias and a single emoji for the map marker. Leave the icon
                blank to keep the normal gym marker.
              </p>
            </div>
            <label>
              Search gyms
              <input
                type="search"
                value={search}
                placeholder="Name, alias or gym ID"
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </div>

          {gyms.length === 0 ? (
            <p>No gyms are available until the first CSV is uploaded.</p>
          ) : (
            <div className="alias-list">
              {filteredGyms.slice(0, 100).map((gym) => (
                <article key={gym.id}>
                  <div className="gym-identity">
                    <strong>
                      {gym.markerEmoji && <span className="gym-admin-icon-preview">{gym.markerEmoji}</span>}
                      {gym.alias || gym.name}
                    </strong>
                    {gym.alias && <small>Official: {gym.name}</small>}
                    <small>{gym.id}</small>
                  </div>
                  <label>
                    Community alias
                    <input
                      value={aliasDrafts[gym.id] ?? gym.alias ?? ""}
                      maxLength={100}
                      placeholder="Leave blank to use the official name"
                      onChange={(event) =>
                        setAliasDrafts((current) => ({
                          ...current,
                          [gym.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Map icon
                    <input
                      value={markerEmojiDrafts[gym.id] ?? gym.markerEmoji ?? ""}
                      maxLength={24}
                      placeholder="e.g. 🐆"
                      aria-label={`Custom map icon for ${gym.alias || gym.name}`}
                      onChange={(event) =>
                        setMarkerEmojiDrafts((current) => ({
                          ...current,
                          [gym.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    disabled={savingDisplay === gym.id}
                    onClick={() => saveDisplaySettings(gym)}
                  >
                    {savingDisplay === gym.id ? "Saving…" : "Save display"}
                  </button>
                </article>
              ))}
              {filteredGyms.length > 100 && (
                <p className="muted">Refine the search to edit gyms beyond the first 100 results.</p>
              )}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
