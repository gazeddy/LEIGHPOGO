const fs = require("fs")
const path = require("path")

describe("Campfire meetup reminder admin UI", () => {
  const app = fs.readFileSync(path.join(process.cwd(), "pages/_app.js"), "utf8")
  const banner = fs.readFileSync(
    path.join(process.cwd(), "components/admin/CampfireReminderBanner.tsx"),
    "utf8",
  )
  const settingsPage = fs.readFileSync(
    path.join(process.cwd(), "pages/admin/campfire-reminders.tsx"),
    "utf8",
  )

  it("surfaces missing meetup reminders throughout the admin area", () => {
    expect(app).toContain('import CampfireReminderBanner from "../components/admin/CampfireReminderBanner"')
    expect(app).toContain("<CampfireReminderBanner />")
    expect(banner).toContain('fetch("/api/admin/campfire-reminders")')
    expect(banner).toContain("need a Campfire meetup")
    expect(banner).toContain('href="/admin/campfire-reminders"')
  })

  it("lets admins configure event types, weekend matching and keywords", () => {
    expect(settingsPage).toContain("includeWeekendEvents")
    expect(settingsPage).toContain("Event name / heading keywords")
    expect(settingsPage).toContain("Imported event types")
    expect(settingsPage).toContain("Use recommended defaults")
    expect(settingsPage).toContain('fetch("/api/admin/campfire-reminder-settings"')
  })

  it("uses explicit tap-friendly ON/OFF buttons for imported event types", () => {
    expect(settingsPage).toContain('aria-pressed={selected}')
    expect(settingsPage).toContain('className={`type-toggle${selected ? " selected" : ""}`}')
    expect(settingsPage).toContain('{selected ? "ON" : "OFF"}')
    expect(settingsPage).toContain('onClick={() => toggleEventType(summary.eventType)}')
    expect(settingsPage).toContain('.type-toggle.selected')
  })
})
