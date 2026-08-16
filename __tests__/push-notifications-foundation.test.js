const fs = require("fs")
const path = require("path")

describe("V3 push notification foundation", () => {
  it("stores push subscriptions against authenticated users", () => {
    const schema = fs.readFileSync(
      path.join(process.cwd(), "prisma/schema.prisma"),
      "utf8",
    )

    expect(schema).toMatch(/pushSubscriptions\s+PushSubscription\[\]/)
    expect(schema).toContain("model PushSubscription")
    expect(schema).toMatch(/endpoint\s+String\s+@unique/)
    expect(schema).toContain("@@index([ownerId])")
  })

  it("adds subscriptions with a forward-only migration", () => {
    const migration = fs.readFileSync(
      path.join(
        process.cwd(),
        "prisma/migrations/20260815162500_add_push_subscriptions/migration.sql",
      ),
      "utf8",
    )

    expect(migration).toContain('CREATE TABLE "PushSubscription"')
    expect(migration).toContain("ON DELETE CASCADE")
    expect(migration).toContain('CREATE UNIQUE INDEX "PushSubscription_endpoint_key"')
  })

  it("keeps notification permission behind an explicit user action", () => {
    const component = fs.readFileSync(
      path.join(process.cwd(), "components/PushNotificationSettings.js"),
      "utf8",
    )

    expect(component).toContain("Notification.requestPermission()")
    expect(component).toContain("onClick={enablePush}")
    expect(component).toContain('fetch("/api/push/subscription"')
  })

  it("does not add fetch caching to the service worker", () => {
    const serviceWorker = fs.readFileSync(
      path.join(process.cwd(), "public/sw.js"),
      "utf8",
    )

    expect(serviceWorker).toContain('addEventListener("push"')
    expect(serviceWorker).not.toContain('addEventListener("fetch"')
  })
})
