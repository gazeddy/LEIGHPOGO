const fs = require("fs")
const path = require("path")

describe("Pokédex selected colour transitions", () => {
  const app = fs.readFileSync(
    path.join(process.cwd(), "pages", "_app.js"),
    "utf8"
  )
  const page = fs.readFileSync(
    path.join(process.cwd(), "pages", "pokedex.js"),
    "utf8"
  )
  const styles = fs.readFileSync(
    path.join(process.cwd(), "styles", "pokedex-selection.css"),
    "utf8"
  )

  test("uncaught selected cards retain the blue-to-grey transition", () => {
    expect(page).toContain('.pokemon-dex-card.selected')
    expect(page).toContain('@keyframes pokemon-card-selection-fade')
    expect(page).toContain('100% { border-color: #484f58; background: #30363d;')
  })

  test("caught expanded cards start blue and fade to green", () => {
    expect(app).toContain('import "../styles/pokedex-selection.css"')
    expect(styles).toContain('.pokemon-dex-card.caught:has(.pokemon-card-summary[aria-expanded="true"])')
    expect(styles).toContain('@keyframes pokemon-card-selection-caught-fade')
    expect(styles).toContain('border-color: #58a6ff')
    expect(styles).toContain('border-color: #2ea043')
    expect(styles).toContain('background: rgba(35, 134, 54, 0.12)')
  })
})
