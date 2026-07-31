const fs = require("fs");
const path = require("path");

function readSource(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("unified guide creator and editor", () => {
  const navbar = readSource("components/Navbar.js");
  const editor = readSource("pages/admin/content.tsx");
  const oldEditor = readSource("pages/admin/guide-images.tsx");
  const oldLinks = readSource("pages/admin/guide-links.tsx");

  it("shows one guide administration entry", () => {
    expect(navbar).toContain('href="/admin/content"');
    expect(navbar).toContain("Guide Creator / Editor");
    expect(navbar).not.toContain('href="/admin/guide-images"');
    expect(navbar).not.toContain('href="/admin/guide-links"');
  });

  it("creates and edits guides from the same screen", () => {
    expect(editor).toContain("Guide creator / editor");
    expect(editor).toContain("Create a new guide");
    expect(editor).toContain('isNewGuide\n          ? "/api/admin/content/guides"');
    expect(editor).toContain(': "/api/admin/content/guide-editor"');
    expect(editor).toContain('method: isNewGuide ? "POST" : "PATCH"');
    expect(editor).toContain("GuideImageUploader");
    expect(editor).toContain("Related guides");
    expect(editor).toContain("Series position");
  });

  it("redirects the two superseded guide tools", () => {
    expect(oldEditor).toContain('destination: "/admin/content"');
    expect(oldLinks).toContain('destination: "/admin/content"');
  });

  it("removes the local event creator surface and endpoint", () => {
    expect(editor).not.toContain("Local event");
    expect(editor).not.toContain("/api/admin/content/events");
    expect(
      fs.existsSync(
        path.join(process.cwd(), "pages/api/admin/content/events.ts"),
      ),
    ).toBe(false);
  });
});
