import Head from "next/head"
import { useSession } from "next-auth/react"
import { useState } from "react"
import prisma from "../lib/prisma"
import TeamBadge from "../components/TeamBadge"
import {
  formatFriendCodeInput,
  normalizeFriendCode,
} from "../lib/friendCode"

async function copyTextToClipboard(value) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textArea = document.createElement("textarea")
  textArea.value = value
  textArea.setAttribute("readonly", "")
  textArea.style.position = "fixed"
  textArea.style.left = "-9999px"
  textArea.style.opacity = "0"
  document.body.appendChild(textArea)
  textArea.select()
  textArea.setSelectionRange(0, value.length)

  const copied = document.execCommand("copy")
  document.body.removeChild(textArea)

  if (!copied) {
    throw new Error("Clipboard copy failed")
  }
}

export default function FriendCodes({ entries }) {
  const { data: session } = useSession()
  const [trainerName, setTrainerName] = useState("")
  const [friendCode, setFriendCode] = useState("")
  const [team, setTeam] = useState("MYSTIC")
  const [message, setMessage] = useState("")
  const [entryList, setEntryList] = useState(entries)
  const [copiedEntryId, setCopiedEntryId] = useState(null)
  const [copyError, setCopyError] = useState("")

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

  const handleCopyFriendCode = async (entry) => {
    const code = normalizeFriendCode(entry.code)

    if (!code) {
      setCopyError("This entry does not have a valid friend code to copy.")
      return
    }

    try {
      await copyTextToClipboard(code)
      setCopiedEntryId(entry.id)
      setCopyError("")
    } catch (error) {
      console.error("Failed to copy friend code", error)
      setCopyError("The friend code could not be copied. Please copy it manually.")
    }
  }

  return (
    <>
      <Head>
        <title>Friend Codes | Leigh Pokémon Go Community</title>
        <meta
          name="description"
          content="Browse Pokémon GO friend codes from the Leigh community and add your own."
        />
      </Head>
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
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={14}
                  placeholder="0000 0000 0000"
                  value={friendCode}
                  onChange={(e) => setFriendCode(formatFriendCodeInput(e.target.value))}
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
              {entryList.map((entry) => {
                const formattedCode = formatFriendCodeInput(entry.code)
                const hasCode = Boolean(normalizeFriendCode(entry.code))
                const copied = copiedEntryId === entry.id

                return (
                  <li key={entry.id} className="entry-row">
                    <div className="entry-meta">
                      <TeamBadge team={entry.team} />
                      <strong>{entry.trainerName || entry.owner.ign}</strong>
                    </div>
                    <div className="entry-code-actions">
                      <div className="entry-code">
                        {hasCode ? formattedCode : "No code provided"}
                      </div>
                      {hasCode && (
                        <button
                          type="button"
                          className={`copy-code-button${copied ? " copied" : ""}`}
                          onClick={() => handleCopyFriendCode(entry)}
                          aria-label={`${copied ? "Copied" : "Copy"} ${entry.trainerName || entry.owner.ign}'s friend code`}
                        >
                          {copied ? "Copied" : "Copy"}
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {copyError && (
            <p className="copy-error" role="alert">
              {copyError}
            </p>
          )}
        </div>

        <style jsx>{`
          .entry-code-actions {
            display: flex;
            min-width: 0;
            align-items: center;
            justify-content: flex-end;
            gap: 10px;
          }

          .copy-code-button {
            width: auto;
            min-width: 74px;
            flex: 0 0 auto;
            padding: 7px 10px;
            border: 1px solid #30363d;
            background: #21262d;
          }

          .copy-code-button:hover {
            border-color: #58a6ff;
            background: #30363d;
          }

          .copy-code-button.copied,
          .copy-code-button.copied:hover {
            border-color: #2ea043;
            background: #238636;
          }

          .copy-error {
            margin-top: 12px;
            color: #ff7b72;
          }

          @media (max-width: 600px) {
            .entry-row {
              flex-direction: column;
              align-items: stretch;
              gap: 12px;
            }

            .entry-code-actions {
              width: 100%;
              justify-content: space-between;
            }

            .copy-code-button {
              width: auto;
            }
          }
        `}</style>
      </div>
    </>
  )
}

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

  const serializedEntries = entries.map((entry) => ({
    ...entry,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  }))

  return {
    props: { entries: serializedEntries },
  }
}
