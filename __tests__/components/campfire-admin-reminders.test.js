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

  it("uses explicit tap-friendly ON, OFF and AUTO modes for imported event types", () => {
    expect(settingsPage).toContain('type ReminderMode = "on" | "auto" | "off"')
    expect(settingsPage).toContain("excludedEventTypes")
    expect(settingsPage).toContain('data-mode={mode}')
    expect(settingsPage).toContain('{mode.toUpperCase()}')
    expect(settingsPage).toContain('onClick={() => cycleEventType(summary.eventType)}')
    expect(settingsPage).toContain('.type-toggle.on')
    expect(settingsPage).toContain('.type-toggle.off')
    expect(settingsPage).toContain('.type-toggle.auto')
    expect(settingsPage).toContain("OFF always wins")
  })

  it("lets admins paste and save a Campfire link directly from each reminder", () => {
    expect(settingsPage).toContain('placeholder="https://cmpf.re/..."')
    expect(settingsPage).toContain('fetch("/api/admin/event-overrides"')
    expect(settingsPage).toContain('campfireUrl,')
    expect(settingsPage).toContain('campfireMeetups: existing?.campfireMeetups ?? []')
    expect(settingsPage).toContain('hidden: existing?.hidden ?? false')
    expect(settingsPage).toContain('hideAt: existing?.hideAt ?? null')
    expect(settingsPage).toContain('setOverrides((current) => [')
    expect(settingsPage).toContain('"Save Campfire"')
    expect(settingsPage).toContain('different Campfire meetups on different days')
  })
})
