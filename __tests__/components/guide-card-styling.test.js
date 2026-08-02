const fs = require("fs");
const path = require("path");

function readSource(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("individual guide card styling", () => {
  const guideCard = readSource("components/guides/GuideCard.tsx");

  it("styles the generated link and the actual card element", () => {
    expect(guideCard).toContain('className="guide-card-link"');
    expect(guideCard).toContain('<article className="guide-card">');
    expect(guideCard).toContain(":global(.guide-card-link)");
    expect(guideCard).toContain("color: #f0f6fc;");
  });

  it("does not rely on a scoped class attached only to Next Link", () => {
    expect(guideCard).not.toContain(
      '<Link href={`/guides/${guide.slug}`} className="guide-card">',
    );
  });
});
