const fs = require("fs")
const path = require("path")

describe("V3 Wednesday Raid Hour push wiring", () => {
  it("stores the device timezone and weekly deduplication key", () => {
    const schema = fs.readFileSync(
      path.join(process.cwd(), "prisma/schema.prisma"),
      "utf8",
    )
    const migration = fs.readFileSync(
      path.join(
        process.cwd(),
        "prisma/migrations/20260816112000_add_raid_hour_push_schedule/migration.sql",
      ),
      "utf8",
    )

    expect(schema).toContain('timeZone                String   @default("Europe/London")')
    expect(schema).toContain("lastRaidHourReminderKey String?")
    expect(migration).toContain('ADD COLUMN "timeZone"')
    expect(migration).toContain('ADD COLUMN "lastRaidHourReminderKey"')
  })

  it("syncs the browser timezone with the saved push subscription", () => {
    const component = fs.readFileSync(
      path.join(process.cwd(), "components/PushNotificationSettings.js"),
      "utf8",
    )

    expect(component).toContain("resolvedOptions().timeZone")
    expect(component).toContain("timeZone: browserTimeZone()")
    expect(component).toContain("Wednesday 18:00 local-time 5★ Raid Hour reminder")
  })

  it("protects the scheduler endpoint with a server-side secret", () => {
    const endpoint = fs.readFileSync(
      path.join(process.cwd(), "pages/api/push/raid-hour.ts"),
      "utf8",
    )

    expect(endpoint).toContain("RAID_HOUR_CRON_SECRET")
    expect(endpoint).toContain("sendWednesdayRaidHourPush")
    expect(endpoint).toContain("timingSafeEqual")
  })

  it("installs a persistent 15-minute systemd timer", () => {
    const installer = fs.readFileSync(
      path.join(process.cwd(), "deploy/install-raid-hour-timer.sh"),
      "utf8",
    )

    expect(installer).toContain("OnCalendar=*-*-* *:00/15:00")
    expect(installer).toContain("Persistent=true")
    expect(installer).toContain("/api/push/raid-hour")
  })
})
