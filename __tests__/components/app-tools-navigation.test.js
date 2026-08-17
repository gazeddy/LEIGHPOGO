const fs = require("fs")
const path = require("path")

describe("installed app quick tools", () => {
  const navbar = fs.readFileSync(
    path.join(process.cwd(), "components/Navbar.js"),
    "utf8",
  )
  const navbarCss = fs.readFileSync(
    path.join(process.cwd(), "styles/navbar.css"),
    "utf8",
  )
  const gymsPage = fs.readFileSync(
    path.join(process.cwd(), "pages/gyms.tsx"),
    "utf8",
  )
  const addGymForm = fs.readFileSync(
    path.join(process.cwd(), "components/gyms/AddGymForm.tsx"),
    "utf8",
  )

  it("gives installed mobile users a direct new-gym shortcut and visual tool grid", () => {
    expect(navbar).toContain('href="/gyms?add=1#add-gym"')
    expect(navbar).toContain('className="app-new-gym-shortcut"')
    expect(navbar).toContain('className="app-tools-panel"')
    expect(navbar).toContain('className="app-tools-grid"')
    expect(navbarCss).toContain('@media (display-mode: standalone) and (max-width: 1050px)')
    expect(navbarCss).toContain('.app-tools-grid')
    expect(navbarCss).toContain('.nav-tools-dropdown')
  })

  it("opens the add-gym form directly when the quick-action query is present", () => {
    expect(gymsPage).toContain('showAddGym: addGymQuery === "1" || addGymQuery === "true"')
    expect(gymsPage).toContain('<AddGymForm initialOpen={showAddGym} />')
    expect(addGymForm).toContain('interface AddGymFormProps')
    expect(addGymForm).toContain('useState(initialOpen)')
    expect(addGymForm).toContain('id="add-gym"')
  })
})
