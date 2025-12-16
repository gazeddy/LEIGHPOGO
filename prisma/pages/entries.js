import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";

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
          <div key={entry.id} style={{
            border: "1px solid #ccc",
            padding: "15px",
            margin: "10px 0",
            borderRadius: "8px"
          }}>
            <h2>{entry.trainerName}</h2>
            <p><strong>Game:</strong> {entry.gameName}</p>
            <p><strong>Friend Code:</strong> {entry.friendCode}</p>
          </div>
        ))}
      </div>
    </>
  );
}
