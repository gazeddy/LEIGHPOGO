const fs = require("fs")
const path = require("path")

describe("V3 raid event push wiring", () => {
  it("stores the device timezone and legacy Raid Hour deduplication key", () => {
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

  it("syncs the browser timezone and describes raid-event reminders", () => {
    const component = fs.readFileSync(
      path.join(process.cwd(), "components/PushNotificationSettings.js"),
      "utf8",
    )

    expect(component).toContain("resolvedOptions().timeZone")
    expect(component).toContain("timeZone: browserTimeZone()")
    expect(component).toContain("raid-event reminders about 30 minutes before Raid Hours and Raid Days")
  })

  it("protects the generic raid-event scheduler endpoint with a server-side secret", () => {
    const endpoint = fs.readFileSync(
      path.join(process.cwd(), "pages/api/push/raid-hour.ts"),
      "utf8",
    )

    expect(endpoint).toContain("RAID_HOUR_CRON_SECRET")
    expect(endpoint).toContain("sendRaidEventPushes")
    expect(endpoint).toContain("timingSafeEqual")
  })

  it("installs server-side VAPID keys without exposing the private key", () => {
    const installer = fs.readFileSync(
      path.join(process.cwd(), "deploy/install-push.sh"),
      "utf8",
    )

    expect(installer).toContain("VAPID_PUBLIC_KEY=")
    expect(installer).toContain("VAPID_PRIVATE_KEY=")
    expect(installer).toContain("VAPID_SUBJECT=")
    expect(installer).toContain("chmod 0600")
    expect(installer).toContain("EnvironmentFile=")
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

  it("keeps the one-command V3 installer isolated from live", () => {
    const installer = fs.readFileSync(
      path.join(process.cwd(), "deploy/install-v3-test.sh"),
      "utf8",
    )

    expect(installer).toContain('REPO_DIR="/projects/V3"')
    expect(installer).toContain('SERVICE_NAME="leighpogo-test"')
    expect(installer).toContain('PORT="3001"')
    expect(installer).toContain('SITE_URL="https://dev.leighpogo.co.uk"')
    expect(installer).toContain('LIVE_DIR="/projects/LIVE"')
    expect(installer).toContain('LIVE_SERVICE="leighpogo.service"')
    expect(installer).toContain('LIVE_PORT="3000"')
    expect(installer).toContain("Refusing to use the LIVE checkout")
    expect(installer).toContain("Refusing to target the live service")
    expect(installer).toContain("Refusing to target the live port")
    expect(installer).toContain('npm run db:deploy')
    expect(installer).toContain('deploy/install-push.sh')
  })
})
