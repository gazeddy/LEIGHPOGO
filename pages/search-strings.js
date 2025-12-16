import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./api/auth/[...nextauth]";
import prisma from "../lib/prisma";

const checkboxOptions = [
  { key: "includeShiny", label: "Include shiny", token: "shiny" },
  { key: "includeShadow", label: "Include shadow", token: "shadow" },
  { key: "includePurified", label: "Include purified", token: "purified" },
  { key: "includeLegendary", label: "Legendary", token: "legendary" },
  { key: "includeMythical", label: "Mythical", token: "mythical" },
  { key: "includeCostumed", label: "Costumed", token: "costumed" },
  { key: "includeMega", label: "Mega eligible", token: "mega" },
  { key: "favoritesOnly", label: "Favorites only", token: "favorite" },
  { key: "excludeTraded", label: "Exclude traded", token: "!traded" },
];

function buildSearchString({
  pokemonNames,
  cpMin,
  cpMax,
  ageMin,
  ageMax,
  ivFilter,
  toggles,
}) {
  const tokens = [];
  const nameTokens = pokemonNames
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  if (nameTokens.length) {
    tokens.push(nameTokens.join(","));
  }

  if (cpMin || cpMax) {
    tokens.push(`cp${cpMin || ""}-${cpMax || ""}`);
  }

  if (ageMin || ageMax) {
    tokens.push(`age${ageMin || ""}-${ageMax || ""}`);
  }

  if (ivFilter === "fourStar") tokens.push("4*");
  if (ivFilter === "threeStar") tokens.push("3*");
  if (ivFilter === "nundo") tokens.push("0* & !shiny");

  checkboxOptions.forEach((option) => {
    if (toggles[option.key]) {
      tokens.push(option.token);
    }
  });

  return tokens.join(" & ");
}

function SavedSearchList({ savedStrings, onCopy, onDelete, isAdmin, loading }) {
  if (loading) {
    return (
      <div className="card">
        <p>Loading saved searches...</p>
      </div>
    );
  }

function SavedSearchList({ savedStrings, onCopy, onDelete, isAdmin }) {
  if (!savedStrings.length) {
    return (
      <div className="card">
        <p>No saved searches yet.</p>
      </div>
    );
  }

  return (
    <div className="saved-list">
      {savedStrings.map((item) => (
        <div key={item.id} className="card saved-item">
          <div className="saved-header">
            <div>
              <h3>{item.title}</h3>
              <p className="muted">{new Date(item.updatedAt).toLocaleString()}</p>
              {isAdmin && item.owner && (
                <p className="muted">Owner: {item.owner.ign}</p>
              )}
            </div>
            <div className="saved-actions">
              <button onClick={() => onCopy(item.query)}>Copy</button>
              <button className="danger" onClick={() => onDelete(item.id)}>
                Delete
              </button>
            </div>
          </div>
          <code className="query-preview">{item.query}</code>
        </div>
      ))}
    </div>
  );
}

export default function SearchStrings() {
  const { data: session, status: sessionStatus } = useSession();
export default function SearchStrings({ initialSavedStrings }) {
  const { data: session } = useSession();
  const [pokemonNames, setPokemonNames] = useState("");
  const [cpMin, setCpMin] = useState("");
  const [cpMax, setCpMax] = useState("");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [ivFilter, setIvFilter] = useState("fourStar");
  const [toggles, setToggles] = useState({
    includeShiny: true,
    includeShadow: false,
    includePurified: false,
    includeLegendary: false,
    includeMythical: false,
    includeCostumed: false,
    includeMega: false,
    favoritesOnly: false,
    excludeTraded: true,
  });
  const [title, setTitle] = useState("Raid ready shinies");
  const [savedStrings, setSavedStrings] = useState([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [loadingSaved, setLoadingSaved] = useState(false);

  useEffect(() => {
    const loadSaved = async () => {
      if (!session) {
        setSavedStrings([]);
        return;
      }

      setLoadingSaved(true);

      try {
        const response = await fetch("/api/search-strings");
        if (!response.ok) {
          throw new Error("Unable to load saved searches");
        }

        const searches = await response.json();
        setSavedStrings(searches);
      } catch (error) {
        console.error(error);
        setStatusMessage("Could not load saved searches.");
      } finally {
        setLoadingSaved(false);
      }
    };

    if (sessionStatus !== "loading") {
      loadSaved();
    }
  }, [session, sessionStatus]);
  const [savedStrings, setSavedStrings] = useState(initialSavedStrings || []);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setSavedStrings(initialSavedStrings || []);
  }, [initialSavedStrings]);

  const searchString = useMemo(
    () =>
      buildSearchString({
        pokemonNames,
        cpMin,
        cpMax,
        ageMin,
        ageMax,
        ivFilter,
        toggles,
      }),
    [pokemonNames, cpMin, cpMax, ageMin, ageMax, ivFilter, toggles]
  );

  const handleToggle = (key) => {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCopy = async (value) => {
    await navigator.clipboard.writeText(value);
    setStatusMessage("Copied to clipboard");
    setTimeout(() => setStatusMessage(""), 2000);
    setStatus("Copied to clipboard");
    setTimeout(() => setStatus(""), 2000);
  };

  const handleSave = async () => {
    if (!session) {
      setStatusMessage("Login to save your search string.");
      setStatus("Login to save your search string.");
      return;
    }

    if (!searchString.trim()) {
      setStatusMessage("Build a search string before saving.");
      setStatus("Build a search string before saving.");
      return;
    }

    const response = await fetch("/api/search-strings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, query: searchString }),
    });

    if (!response.ok) {
      const error = await response.json();
      setStatusMessage(error.error || "Unable to save search.");
      setStatus(error.error || "Unable to save search.");
      return;
    }

    const saved = await response.json();
    setSavedStrings((prev) => [saved, ...prev]);
    setStatusMessage("Saved!");
    setStatus("Saved!");
  };

  const handleDelete = async (id) => {
    const response = await fetch(`/api/search-strings/${id}`, {
      method: "DELETE",
    });

    if (response.ok) {
      setSavedStrings((prev) => prev.filter((item) => item.id !== id));
      setStatusMessage("Deleted");
    } else {
      setStatusMessage("Unable to delete search");
      setStatus("Deleted");
    } else {
      setStatus("Unable to delete search");
    }
  };

  const isAdmin = session?.user?.role === "admin";

  return (
    <div className="container">
      <h1>Storage Search Builder</h1>
      <p className="muted">
        Assemble Pokémon GO storage search strings with common filters and save
        them for quick reuse. Only you and admins can see your saved strings.
      </p>

      <div className="card">
        <div className="form-grid">
          <div>
            <label htmlFor="pokemonNames">Pokémon (comma or newline separated)</label>
            <textarea
              id="pokemonNames"
              rows={4}
              placeholder="pikachu, rayquaza, metagross"
              value={pokemonNames}
              onChange={(e) => setPokemonNames(e.target.value)}
            />
          </div>
          <div className="dual-inputs">
            <div>
              <label htmlFor="cpMin">CP min</label>
              <input
                id="cpMin"
                type="number"
                min="0"
                value={cpMin}
                onChange={(e) => setCpMin(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="cpMax">CP max</label>
              <input
                id="cpMax"
                type="number"
                min="0"
                value={cpMax}
                onChange={(e) => setCpMax(e.target.value)}
              />
            </div>
          </div>
          <div className="dual-inputs">
            <div>
              <label htmlFor="ageMin">Age min (days)</label>
              <input
                id="ageMin"
                type="number"
                min="0"
                value={ageMin}
                onChange={(e) => setAgeMin(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="ageMax">Age max (days)</label>
              <input
                id="ageMax"
                type="number"
                min="0"
                value={ageMax}
                onChange={(e) => setAgeMax(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label htmlFor="ivFilter">IV Filter</label>
            <select
              id="ivFilter"
              value={ivFilter}
              onChange={(e) => setIvFilter(e.target.value)}
            >
              <option value="fourStar">4★ (Hundo)</option>
              <option value="threeStar">3★+</option>
              <option value="nundo">0★ non-shiny</option>
              <option value="">No IV filter</option>
            </select>
          </div>
          <div className="checkboxes">
            {checkboxOptions.map((option) => (
              <label key={option.key} className="checkbox">
                <input
                  type="checkbox"
                  checked={toggles[option.key]}
                  onChange={() => handleToggle(option.key)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        <div className="result-card">
          <div className="result-header">
            <div>
              <h3>Generated search string</h3>
              <p className="muted">
                Combine filters to mirror https://pogosearchgenerator.com/ behaviour.
              </p>
            </div>
            <button
              type="button"
              disabled={!searchString}
              onClick={() => handleCopy(searchString)}
            >
              Copy
            </button>
          </div>
          <code className="query-preview">{searchString || "Add filters to build a search."}</code>
        </div>

        <div className="save-row">
          <div>
            <label htmlFor="title">Save as</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Rocket hunt"
            />
          </div>
          <button type="button" onClick={handleSave}>
            Save search
          </button>
        </div>

        {statusMessage && <p className="status">{statusMessage}</p>}
        {status && <p className="status">{status}</p>}
      </div>

      <h2>Saved searches</h2>
      <SavedSearchList
        savedStrings={savedStrings}
        onCopy={handleCopy}
        onDelete={handleDelete}
        isAdmin={isAdmin}
        loading={loadingSaved}
      />
    </div>
  );
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);

  if (!session) {
    return { props: { initialSavedStrings: [] } };
  }

  const isAdmin = session.user.role === "admin";
  const searchStrings = await prisma.searchString.findMany({
    where: isAdmin ? {} : { ownerId: session.user.id },
    include: { owner: { select: { id: true, ign: true } } },
    orderBy: { updatedAt: "desc" },
  });

  const initialSavedStrings = searchStrings.map((entry) => ({
    ...entry,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  }));

  return { props: { initialSavedStrings } };
}
