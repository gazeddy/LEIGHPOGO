const fs = require("fs");
const path = require("path");

function readSource(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("guide series cards", () => {
  const guidesIndex = readSource("pages/guides/index.tsx");

  it("puts the visual card class on a rendered HTML element", () => {
    expect(guidesIndex).toContain('<article className="series-card">');
    expect(guidesIndex).toContain('className="series-card-link"');
  });

  it("removes default link styling and preserves card hover styling", () => {
    expect(guidesIndex).toContain(".series-card-link {");
    expect(guidesIndex).toContain("color: inherit;");
    expect(guidesIndex).toContain("text-decoration: none;");
    expect(guidesIndex).toContain(".series-card-link:hover .series-card");
  });
});
