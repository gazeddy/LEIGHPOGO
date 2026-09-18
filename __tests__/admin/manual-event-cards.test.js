const fs = require("fs");
const path = require("path");

function readSource(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("manual event cards", () => {
  const navbar = readSource("components/Navbar.js");
  const page = readSource("pages/admin/local-events.tsx");
  const api = readSource("pages/api/admin/local-events.ts");
  const localEvents = readSource("lib/local-events.ts");
  const eventsServer = readSource("lib/events-server.ts");

  it("adds an admin route for creating manual event cards", () => {
    expect(navbar).toContain('href="/admin/local-events"');
    expect(navbar).toContain("Manual Event Cards");
    expect(page).toContain("Create event card");
    expect(page).toContain("<EventCard event={preview} />");
  });

  it("keeps manual events separate from the imported feed", () => {
    expect(localEvents).toContain('path.join(process.cwd(), "data", "local-events.json")');
    expect(eventsServer).toContain("readLocalEvents");
    expect(eventsServer).toContain("localEvents.map(localEventToSummary)");
  });

  it("supports admin create, edit and delete", () => {
    expect(api).toContain('req.method === "POST"');
    expect(api).toContain('req.method === "PUT"');
    expect(api).toContain('req.method === "DELETE"');
    expect(api).toContain("updateLocalEvent");
    expect(localEvents).toContain("export async function updateLocalEvent");
  });
});
