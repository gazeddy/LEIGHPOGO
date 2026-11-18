const fs = require("fs")
const path = require("path")

describe("Campfire reminder admin navigation", () => {
  const navbar = fs.readFileSync(
    path.join(process.cwd(), "components/Navbar.js"),
    "utf8",
  )

  it("links Campfire reminders directly after Event Types in the admin menu", () => {
    const eventTypes = '<Link href="/admin/event-types" className="nav-item nav-subitem">Event Types</Link>'
    const campfire = '<Link href="/admin/campfire-reminders" className="nav-item nav-subitem">Campfire Reminders</Link>'

    expect(navbar).toContain(eventTypes)
    expect(navbar).toContain(campfire)
    expect(navbar.indexOf(campfire)).toBeGreaterThan(navbar.indexOf(eventTypes))
  })
})
