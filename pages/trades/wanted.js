import Image from "next/image"
import Link from "next/link"
import { useMemo, useState } from "react"
import { getServerSession } from "next-auth/next"
import { authOptions } from "../api/auth/[...nextauth]"
import prisma from "../../lib/prisma"
import pokedexByRegion from "../../lib/pokedexData"
import { getAuthenticatedUser } from "../../lib/tradeServer"
import { formatFriendCode } from "../../lib/tradeUtils"
import {
  buildEffectiveReleasedPokemonOptions,
  serializeWantedTrade,
  wantedTradeInclude,
} from "../../lib/wantedTradeUtils"

const modifierDefinitions = [
  ["shiny", "Shiny"],
  ["lucky", "Lucky"],
  ["costume", "Costume"],
  ["background", "Special background"],
  ["dynamax", "Dynamax"],
  ["gigantamax", "Gigantamax"],
]

const emptyModifiers = () => ({
  shiny: false,
  lucky: false,
  costume: false,
  background: false,
  dynamax: false,
  gigantamax: false,
})

const pokemonSpriteUrl = (dexNumber) =>
  `https://raw.githubusercontent.com/nileplumb/PkmnHomeIcons/master/UICONS_OS/pokemon/${dexNumber}.png`

const entryModifiers = (entry) => [
  entry.shiny && "Shiny",
  entry.lucky && "Lucky",
  entry.xxl && "XXL",
  entry.xxs && "XXS",
  entry.costume && "Costume",
  entry.background && "Special background",
  entry.dynamax && "Dynamax",
  entry.gigantamax && "Gigantamax",
].filter(Boolean)

function WantedTradeCard({ entry, canDelete, onDelete }) {
  const modifiers = entryModifiers(entry)

  return (
    <article className="card wanted-trade-card">
      <div className="wanted-card-main">
        <Image
          src={pokemonSpriteUrl(entry.dexNumber)}
          alt=""
          aria-hidden="true"
          width={76}
          height={76}
          className="wanted-pokemon-sprite"
        />
        <div className="wanted-card-content">
          <div className="wanted-card-heading">
            <div>
              <span className="muted wanted-dex-number">
                #{String(entry.dexNumber).padStart(3, "0")}
              </span>
              <h2>{entry.pokemonName}</h2>
            </div>
            {canDelete && (
              <button
                type="button"
                className="danger compact-button"
                onClick={() => onDelete(entry.id)}
              >
                Remove
              </button>
            )}
          </div>

          {modifiers.length > 0 ? (
            <div className="wanted-modifier-list">
              {modifiers.map((modifier) => (
                <span className="wanted-modifier" key={modifier}>
                  {modifier}
                </span>
              ))}
            </div>
          ) : (
            <p className="muted">No specific modifiers</p>
          )}

          {entry.notes && <p className="wanted-notes">{entry.notes}</p>}
        </div>
      </div>

      <div className="wanted-owner">
        <div>
          <strong>{entry.owner.ign}</strong>
          <p className="muted">
            Added {new Date(entry.createdAt).toLocaleDateString("en-GB")}
          </p>
        </div>
        {entry.owner.friendCode && (
          <code>{formatFriendCode(entry.owner.friendCode)}</code>
        )}
      </div>
    </article>
  )
}

export default function WantedTradesPage({
  initialEntries,
  pokemonOptions,
  currentUserId,
  isAdmin,
  releaseDataStale,
  releaseDataError,
}) {
  const [entries, setEntries] = useState(initialEntries)
  const [pokemonSearch, setPokemonSearch] = useState("")
  const [selectedDexNumber, setSelectedDexNumber] = useState("")
  const [sizeModifier, setSizeModifier] = useState("ANY")
  const [modifiers, setModifiers] = useState(emptyModifiers)
  const [notes, setNotes] = useState("")
  const [boardSearch, setBoardSearch] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")

  const matchingPokemon = useMemo(() => {
    const query = pokemonSearch.trim().toLowerCase()
    const matches = query
      ? pokemonOptions.filter(
          (pokemon) =>
            pokemon.name.toLowerCase().includes(query) ||
            String(pokemon.dexNumber).includes(query),
        )
      : pokemonOptions

    return matches.slice(0, 100)
  }, [pokemonOptions, pokemonSearch])

  const visibleEntries = useMemo(() => {
    const query = boardSearch.trim().toLowerCase()
    if (!query) return entries

    return entries.filter(
      (entry) =>
        entry.pokemonName.toLowerCase().includes(query) ||
        entry.owner.ign.toLowerCase().includes(query) ||
        entryModifiers(entry).some((modifier) =>
          modifier.toLowerCase().includes(query),
        ),
    )
  }, [boardSearch, entries])

  const resetForm = () => {
    setPokemonSearch("")
    setSelectedDexNumber("")
    setSizeModifier("ANY")
    setModifiers(emptyModifiers())
    setNotes("")
  }

  const createEntry = async (event) => {
    event.preventDefault()
    setStatusMessage("")

    if (!selectedDexNumber) {
      setStatusMessage("Search for and select a Pokémon first.")
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch("/api/trades/wanted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dexNumber: Number(selectedDexNumber),
          ...modifiers,
          xxl: sizeModifier === "XXL",
          xxs: sizeModifier === "XXS",
          notes,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Unable to add wanted Pokémon.")
      }

      setEntries((current) => [data, ...current])
      resetForm()
      setStatusMessage(`${data.pokemonName} added to your wanted list.`)
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const deleteEntry = async (entryId) => {
    if (!window.confirm("Remove this Pokémon from the wanted board?")) return

    const response = await fetch(`/api/trades/wanted/${entryId}`, {
      method: "DELETE",
    })
    const data = await response.json()

    if (!response.ok) {
      window.alert(data.error || "Unable to remove wanted Pokémon.")
      return
    }

    setEntries((current) => current.filter((entry) => entry.id !== entryId))
  }

  return (
    <div className="container wanted-trades-page">
      <div className="card wanted-trades-hero">
        <div>
          <h1>Wanted trades</h1>
          <p className="muted">
            Add individual Pokémon you are looking for and include the exact modifiers that matter.
          </p>
        </div>
        <Link className="button-link secondary-button" href="/trades">
          Trade listings
        </Link>
      </div>

      <form className="card wanted-trade-form" onSubmit={createEntry}>
        <div>
          <h2>Add a wanted Pokémon</h2>
          <p className="muted">
            Search by Pokémon name or National Pokédex number, then select the result.
          </p>
          {releaseDataStale && (
            <p className="muted">Using the last cached released-Pokémon list.</p>
          )}
          {releaseDataError && <p className="status-text">{releaseDataError}</p>}
        </div>

        <div className="wanted-picker-grid">
          <label>
            Search Pokémon
            <input
              type="search"
              value={pokemonSearch}
              onChange={(event) => setPokemonSearch(event.target.value)}
              placeholder="For example: Pikachu or 025"
              disabled={!pokemonOptions.length}
            />
          </label>

          <label>
            Select Pokémon
            <select
              value={selectedDexNumber}
              onChange={(event) => setSelectedDexNumber(event.target.value)}
              required
              disabled={!pokemonOptions.length}
            >
              <option value="">Choose a Pokémon</option>
              {matchingPokemon.map((pokemon) => (
                <option value={pokemon.dexNumber} key={pokemon.dexNumber}>
                  #{String(pokemon.dexNumber).padStart(3, "0")} {pokemon.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="wanted-fieldset">
          <legend>Size</legend>
          <div className="wanted-radio-row">
            {[
              ["ANY", "Any size"],
              ["XXL", "XXL"],
              ["XXS", "XXS"],
            ].map(([value, label]) => (
              <label className="checkbox" key={value}>
                <input
                  type="radio"
                  name="wanted-size"
                  value={value}
                  checked={sizeModifier === value}
                  onChange={() => setSizeModifier(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="wanted-fieldset">
          <legend>Modifiers</legend>
          <div className="wanted-modifier-grid">
            {modifierDefinitions.map(([key, label]) => (
              <label className="checkbox" key={key}>
                <input
                  type="checkbox"
                  checked={modifiers[key]}
                  onChange={(event) =>
                    setModifiers((current) => ({
                      ...current,
                      [key]: event.target.checked,
                    }))
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <label>
          Notes
          <input
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={250}
            placeholder="Form, legacy move, event costume, location, or availability"
          />
        </label>

        <div className="wanted-form-actions">
          <button type="submit" disabled={isSubmitting || !pokemonOptions.length}>
            {isSubmitting ? "Adding…" : "Add to wanted list"}
          </button>
          {statusMessage && <p className="status-text">{statusMessage}</p>}
        </div>
      </form>

      <section>
        <div className="wanted-board-heading">
          <div>
            <h2>Community wanted board</h2>
            <p className="muted">
              {visibleEntries.length} of {entries.length} wanted entries shown
            </p>
          </div>
          <label className="wanted-board-search">
            Search board
            <input
              type="search"
              value={boardSearch}
              onChange={(event) => setBoardSearch(event.target.value)}
              placeholder="Pokémon, trainer, or modifier"
            />
          </label>
        </div>

        {visibleEntries.length === 0 ? (
          <div className="card">
            <p className="muted">
              {entries.length
                ? "No wanted entries match that search."
                : "No Pokémon have been added to the wanted board yet."}
            </p>
          </div>
        ) : (
          <div className="wanted-trade-grid">
            {visibleEntries.map((entry) => (
              <WantedTradeCard
                key={entry.id}
                entry={entry}
                canDelete={entry.ownerId === currentUserId || isAdmin}
                onDelete={deleteEntry}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions)

  if (!session) {
    return {
      redirect: { destination: "/login", permanent: false },
    }
  }

  const currentUser = await getAuthenticatedUser(session)

  if (!currentUser) {
    return {
      redirect: { destination: "/login", permanent: false },
    }
  }

  let pokemonOptions = []
  let releaseDataStale = false
  let releaseDataError = ""

  try {
    const { getReleasedPokemonData } = require("../../lib/releasedPokemonCache")
    const { readPokemonAvailabilityOverrides } = require("../../lib/pokemonAvailabilityStore")
    const releasedPokemonData = await getReleasedPokemonData()
    const overrideResult = await readPokemonAvailabilityOverrides()
    pokemonOptions = buildEffectiveReleasedPokemonOptions(
      pokedexByRegion,
      releasedPokemonData.dexNumbers,
      overrideResult.overrides,
    )
    releaseDataStale = releasedPokemonData.stale
  } catch (error) {
    console.error("Unable to load released Pokémon for wanted trades", error)
    releaseDataError = "The released Pokémon selector is temporarily unavailable."
  }

  const entries = await prisma.wantedTrade.findMany({
    include: wantedTradeInclude,
    orderBy: { createdAt: "desc" },
  })

  return {
    props: {
      initialEntries: entries.map(serializeWantedTrade),
      pokemonOptions,
      currentUserId: currentUser.id,
      isAdmin: currentUser.role === "admin",
      releaseDataStale,
      releaseDataError,
    },
  }
}
