import React from "react"

const TEAM_METADATA = {
  NONE: {
    label: "No Team",
    color: "#9CA3AF",
    icon:
      "https://raw.githubusercontent.com/nileplumb/PkmnHomeIcons/master/UICONS_OS_128/team/0.png",
  },
  INSTINCT: {
    label: "Instinct",
    color: "#f7d02c",
    icon:
      "https://raw.githubusercontent.com/nileplumb/PkmnHomeIcons/master/UICONS_OS_128/team/3.png",
  },
  MYSTIC: {
    label: "Mystic",
    color: "#3d7dca",
    icon:
      "https://raw.githubusercontent.com/nileplumb/PkmnHomeIcons/master/UICONS_OS_128/team/1.png",
  },
  VALOR: {
    label: "Valor",
    color: "#e53e3e",
    icon:
      "https://raw.githubusercontent.com/nileplumb/PkmnHomeIcons/master/UICONS_OS_128/team/2.png",
  },
}

export default function TeamBadge({ team }) {
  const normalized = team ? team.toUpperCase() : "NONE"
  const meta = TEAM_METADATA[normalized] || TEAM_METADATA.NONE

  return (
    <span className="team-badge" title={`${meta.label} team`}>
      <span className="team-icon" style={{ backgroundColor: meta.color }} aria-hidden="true">
        <img src={meta.icon} alt={`${meta.label} icon`} />
      </span>
      <span className="team-label">{meta.label}</span>
    </span>
  )
}
