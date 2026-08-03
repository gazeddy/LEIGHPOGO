const fs = require("fs")

const pagePath = "pages/pokedex.js"
const testPath = "__tests__/pokedex-folding-search.test.js"

let page = fs.readFileSync(pagePath, "utf8")

const oldCardStyles = `    .pokemon-dex-card { display: grid; align-content: start; gap: 12px; padding: 14px; border: 1px solid #30363d; border-radius: 10px; background: #0d1117; scroll-margin-top: 88px; }
    .pokemon-dex-card.caught { border-color: #2ea043; background: rgba(35, 134, 54, 0.12); }`

const newCardStyles = `    .pokemon-dex-card { display: grid; align-content: start; gap: 12px; padding: 14px; border: 1px solid #484f58; border-radius: 10px; background: #30363d; scroll-margin-top: 88px; }
    .pokemon-dex-card.selected { animation: pokemon-card-selection-fade 1.2s ease-out forwards; }
    .pokemon-dex-card.caught { border-color: #2ea043; background: rgba(35, 134, 54, 0.12); }
    @keyframes pokemon-card-selection-fade {
      0% { border-color: #58a6ff; background: #1f4f78; box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.35); }
      100% { border-color: #484f58; background: #30363d; box-shadow: none; }
    }`

if (!page.includes(oldCardStyles)) {
  throw new Error("Unable to find Pokédex card style block")
}
page = page.replace(oldCardStyles, newCardStyles)

const oldClassName = `      className={\`pokemon-dex-card \${caught ? "caught" : ""} \${
        unavailable ? "unavailable" : ""
      }\`}`
const newClassName = `      className={\`pokemon-dex-card \${caught ? "caught" : ""} \${
        unavailable ? "unavailable" : ""
      } \${expanded && !caught ? "selected" : ""}\`}`

if (!page.includes(oldClassName)) {
  throw new Error("Unable to find Pokédex card class expression")
}
page = page.replace(oldClassName, newClassName)
fs.writeFileSync(pagePath, page)

let test = fs.readFileSync(testPath, "utf8")
const closing = `  test("evolution navigation clears search and expands the destination", () => {
    expect(page).toContain('setSearchQuery("")')
    expect(page).toContain("setExpandedDex(dexNumber)")
  })
}`
const replacement = `  test("evolution navigation clears search and expands the destination", () => {
    expect(page).toContain('setSearchQuery("")')
    expect(page).toContain("setExpandedDex(dexNumber)")
  })

  test("matches navbar grey and fades selection unless caught", () => {
    expect(page).toContain("border: 1px solid #484f58")
    expect(page).toContain("background: #30363d")
    expect(page).toContain(".pokemon-dex-card.selected")
    expect(page).toContain("@keyframes pokemon-card-selection-fade")
    expect(page).toContain('expanded && !caught ? "selected" : ""')
  })
}`

if (!test.includes(closing)) {
  throw new Error("Unable to find folding test insertion point")
}
test = test.replace(closing, replacement)
fs.writeFileSync(testPath, test)
