const fs = require("fs")
const path = require("path")

describe("event card infographic action", () => {
  const eventCard = fs.readFileSync(
    path.join(process.cwd(), "components/events/EventCard.tsx"),
    "utf8",
  )

  it("checks the stable public PNG before showing the infographic action", () => {
    expect(eventCard).toContain('method: "HEAD"')
    expect(eventCard).toContain('response.headers.get("content-type")?.includes("image/png")')
    expect(eventCard).toContain('setHasInfographic(true)')
    expect(eventCard).toContain('return `/generated/events/${safe}-leighpogo.png`;')
  })

  it("places Infographic between the event type and Campfire actions", () => {
    const typeIndex = eventCard.indexOf('<p className="event-type">{event.heading}</p>')
    const infographicIndex = eventCard.indexOf('className="event-infographic-pill"')
    const campfireIndex = eventCard.indexOf('className="event-campfire-pill"')

    expect(typeIndex).toBeGreaterThan(-1)
    expect(infographicIndex).toBeGreaterThan(typeIndex)
    expect(campfireIndex).toBeGreaterThan(infographicIndex)
    expect(eventCard).toContain('.event-target > .event-infographic-link')
    expect(eventCard).toContain('display: none !important;')
  })
})
