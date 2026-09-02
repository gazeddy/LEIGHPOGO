const fs = require("fs");
const path = require("path");

describe("generated event infographic middleware access", () => {
  test("generated event PNGs are explicitly public", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "middleware.js"), "utf8");

    expect(source).toContain('pathname.startsWith("/generated/events/")');
  });
});
