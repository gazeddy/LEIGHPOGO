const fs = require("fs")
const path = require("path")

describe("installed app notification badging", () => {
  const navbar = fs.readFileSync(
    path.join(process.cwd(), "components/Navbar.js"),
    "utf8",
  )

  it("uses the unread in-app notification summary to drive the OS badge", () => {
    expect(navbar).toContain('/api/notifications?summary=1')
    expect(navbar).toContain('navigator.setAppBadge')
    expect(navbar).toContain('navigator.clearAppBadge')
    expect(navbar).toContain('syncAppBadge(unreadCount)')
  })

  it("refreshes the badge when the installed app becomes active again", () => {
    expect(navbar).toContain('window.addEventListener("focus"')
    expect(navbar).toContain('document.addEventListener("visibilitychange"')
    expect(navbar).toContain('document.visibilityState === "visible"')
    expect(navbar).toContain('window.setInterval(loadUnreadNotifications, 60_000)')
  })

  it("clears the badge when unread notifications reach zero or the user logs out", () => {
    expect(navbar).toContain('void syncAppBadge(0)')
    expect(navbar).toContain('setUnreadNotifications(0)')
  })
})
