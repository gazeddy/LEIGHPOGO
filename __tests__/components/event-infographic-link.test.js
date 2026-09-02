const fs = require("fs")
const path = require("path")

describe("event card infographic action", () => {
  const eventsPage = fs.readFileSync(
    path.join(process.cwd(), "pages/events/index.tsx"),
    "utf8",
  )

  it("links bonus-bearing event cards to their stable public infographic", () => {
    expect(eventsPage).toContain('const hasInfographic = (event.bonuses?.length ?? 0) > 0')
    expect(eventsPage).toContain('href={eventInfographicUrl(event.eventID)}')
    expect(eventsPage).toContain('className="event-infographic-link"')
    expect(eventsPage).toContain('Infographic <span aria-hidden="true">↗</span>')
    expect(eventsPage).toContain('return `/generated/events/${safe}-leighpogo.png`;')
  })
})
