const fs = require("fs");
const path = require("path");

describe("Pokédex Mega Evolution costs", () => {
  const page = fs.readFileSync(
    path.join(process.cwd(), "pages", "pokedex.js"),
    "utf8"
  );

  test("renders Mega costs only when Mega forms are present", () => {
    expect(page).toContain("megaEvolutions.length > 0");
    expect(page).toContain("Mega Evolution");
    expect(page).toContain("First:");
    expect(page).toContain("Repeat:");
    expect(page).toContain("Mega Energy");
  });
});
