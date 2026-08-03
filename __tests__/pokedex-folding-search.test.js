const fs = require("fs")
const path = require("path")

describe("Pokédex folding and search", () => {
  const page = fs.readFileSync(
    path.join(process.cwd(), "pages", "pokedex.js"),
    "utf8"
  )

  test("regions and Pokémon details start collapsed", () => {
    expect(page).toContain("const [isOpen, setIsOpen] = useState(false)")
    expect(page).toContain("const [expandedDex, setExpandedDex] = useState(null)")
    expect(page).toContain("{expanded && (")
    expect(page).toContain("aria-expanded={expanded}")
  })

  test("search filters by name or National Dex number and opens result regions", () => {
    expect(page).toContain('type="search"')
    expect(page).toContain("pokemon.name.toLowerCase().includes(query)")
    expect(page).toContain('query.replace(/^#/, "")')
    expect(page).toContain("forceOpen={Boolean(searchQuery.trim())}")
    expect(page).toContain("No Pokémon match that search.")
  })

  test("evolution navigation clears search and expands the destination", () => {
    expect(page).toContain('setSearchQuery("")')
    expect(page).toContain("setExpandedDex(dexNumber)")
  })
})
