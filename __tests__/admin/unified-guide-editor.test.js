const fs = require("fs");
const path = require("path");

function readSource(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("unified guide creator and editor", () => {
  const navbar = readSource("components/Navbar.js");
  const editor = readSource("pages/admin/content.tsx");
  const guideMedia = readSource("components/admin/GuideImageUploader.tsx");
  const markdownContent = readSource("components/guides/MarkdownContent.tsx");
  const youtubeHelper = readSource("lib/youtube.ts");
  const oldEditor = readSource("pages/admin/guide-images.tsx");
  const oldLinks = readSource("pages/admin/guide-links.tsx");
  const publishedGuide = readSource("pages/guides/[slug].tsx");

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

  it("inserts YouTube links and renders responsive click-to-play embeds", () => {
    expect(guideMedia).toContain("YouTube link");
    expect(guideMedia).toContain("Insert YouTube video at cursor");
    expect(guideMedia).toContain("normalizeYouTubeUrl");
    expect(guideMedia).toContain("Videos start when the reader presses");
    expect(markdownContent).toContain("getYouTubeEmbedUrl");
    expect(markdownContent).toContain("aspect-ratio: 16 / 9");
    expect(markdownContent).toContain("allowFullScreen");
    expect(youtubeHelper).toContain('playsinline: "1"');
    expect(youtubeHelper).not.toContain('autoplay: "1"');
    expect(youtubeHelper).not.toContain('mute: "1"');
    expect(youtubeHelper).not.toContain('enablejsapi: "1"');
  });

  it("redirects the two superseded guide tools", () => {
    expect(oldEditor).toContain('destination: "/admin/content"');
    expect(oldLinks).toContain('destination: "/admin/content"');
  });

  it("opens published guides directly in the unified editor", () => {
    expect(editor).toContain("getGuideBySlug");
    expect(editor).toContain("initialGuide: EditableGuide | null");
    expect(editor).toContain("context.query.guide");
    expect(editor).toContain("initialGuide?.slug ?? NEW_GUIDE_VALUE");
    expect(publishedGuide).toContain('pathname: "/admin/content"');
    expect(publishedGuide).toContain("query: { guide: guide.slug }");
    expect(publishedGuide).toContain("Edit this guide");
  });

  it("preserves selected guides through legacy editor redirects", () => {
    expect(oldEditor).toContain("context.query.slug");
    expect(oldEditor).toContain("/admin/content?guide=");
    expect(oldLinks).toContain("context.query.slug");
    expect(oldLinks).toContain("/admin/content?guide=");
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
