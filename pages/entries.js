import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import TeamBadge from "../components/TeamBadge";

export default function EntriesPage() {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    async function loadEntries() {
      const res = await fetch("/api/entries");
      const data = await res.json();
      setEntries(data);
    }
    loadEntries();
  }, []);

  return (
    <>
      <Navbar />
      <div style={{ padding: "20px" }}>
        <h1>All Friend Code Entries</h1>

        {entries.length === 0 && <p>No entries yet…</p>}

        {entries.map((entry) => (
          <div
            key={entry.id}
            style={{
              border: "1px solid #ccc",
              padding: "15px",
              margin: "10px 0",
              borderRadius: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <TeamBadge team={entry.team} />
              <h2 style={{ margin: 0 }}>{entry.trainerName || entry.owner?.ign}</h2>
            </div>
            <p style={{ margin: "0.5rem 0" }}><strong>Friend Code:</strong> {entry.code}</p>
          </div>
        ))}
      </div>
    </>
  );
}
