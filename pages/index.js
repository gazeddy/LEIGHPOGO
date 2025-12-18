import { useSession } from "next-auth/react"
import { useState } from "react"
import prisma from "../lib/prisma"
import TeamBadge from "../components/TeamBadge"

export default function Home({ entries }) {
  const { data: session } = useSession()
  const [trainerName, setTrainerName] = useState("")
  const [friendCode, setFriendCode] = useState("")
  const [team, setTeam] = useState("MYSTIC")
  const [message, setMessage] = useState("")
  const [entryList, setEntryList] = useState(entries)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!session) {
      setMessage("You must be logged in to add a friend code.")
      return
    }

    const res = await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trainerName,
        friendCode,
        team,
      }),
    })

    if (res.ok) {
      const newEntry = await res.json()
      setEntryList((prev) => [newEntry, ...prev])
      setTrainerName("")
      setFriendCode("")
      setTeam("MYSTIC")
      setMessage("Entry added!")
    } else {
      const err = await res.json()
      setMessage(err.error || "Failed to add entry.")
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Pokémon GO Friend Codes</h1>
        <p className="muted">
          Browse the latest codes from the community and add your own to let others
          connect with you.
        </p>
      </div>

      <div className="card">
        <h2>Add your friend code</h2>
        {session ? (
          <form className="stack" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="trainerName">Trainer Name</label>
              <input
                id="trainerName"
                type="text"
                placeholder="Trainer Name"
                value={trainerName}
                onChange={(e) => setTrainerName(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="friendCode">Friend Code</label>
              <input
                id="friendCode"
                type="text"
                placeholder="Friend Code"
                value={friendCode}
                onChange={(e) => setFriendCode(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="team">Team</label>
              <select id="team" value={team} onChange={(e) => setTeam(e.target.value)}>
                <option value="INSTINCT">Instinct (Yellow)</option>
                <option value="MYSTIC">Mystic (Blue)</option>
                <option value="VALOR">Valor (Red)</option>
              </select>
            </div>
            <button type="submit">Submit</button>
          </form>
        ) : (
          <p className="muted">Log in to add your friend code.</p>
        )}
        {message && <p className="status">{message}</p>}
      </div>

      <div className="card">
        <h2>Community friend codes</h2>
        {entryList.length === 0 ? (
          <p>No entries yet.</p>
        ) : (
          <ul className="entry-list">
            {entryList.map((entry) => (
              <li key={entry.id} className="entry-row">
                <div className="entry-meta">
                  <TeamBadge team={entry.team} />
                  <strong>{entry.trainerName || entry.owner.ign}</strong>
                </div>
                <div className="entry-code">{entry.code || "No code provided"}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// Fetch all entries and include the owner's IGN
export async function getServerSideProps() {
  const entries = await prisma.entry.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      owner: {
        select: {
          ign: true,
        },
      },
    },
  })

  // Serialize dates to strings for JSON
  const serializedEntries = entries.map(entry => ({
    ...entry,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  }))

  return {
    props: { entries: serializedEntries },
  }
}
