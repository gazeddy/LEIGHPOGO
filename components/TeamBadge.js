import React from "react"

const TEAM_METADATA = {
  INSTINCT: { label: "Instinct", color: "#f7d02c", symbol: "⚡" },
  MYSTIC: { label: "Mystic", color: "#3d7dca", symbol: "❄️" },
  VALOR: { label: "Valor", color: "#e53e3e", symbol: "🔥" },
}

export default function TeamBadge({ team }) {
  if (!team) return null

  const normalized = team.toUpperCase()
  const meta = TEAM_METADATA[normalized]

  if (!meta) return null

  return (
    <span className="team-badge" title={`${meta.label} team`}>
      <span className="team-icon" style={{ backgroundColor: meta.color }} aria-hidden="true">
        {meta.symbol}
      </span>
      <span className="team-label">{meta.label}</span>
    </span>
  )
}
