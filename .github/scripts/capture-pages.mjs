import fs from "node:fs/promises";
import { chromium } from "@playwright/test";

const baseURL = "http://127.0.0.1:3000";
const outputDirectory = "screenshots";

await fs.mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

async function capture(path, filename) {
  await page.goto(`${baseURL}${path}`, { waitUntil: "networkidle" });
  await page.screenshot({
    path: `${outputDirectory}/${filename}`,
    fullPage: true,
  });
}

await page.goto(`${baseURL}/login`, { waitUntil: "networkidle" });
await page.getByLabel("In-Game Name").fill("Angryspanner");
await page.getByLabel("Password").fill("test");
await Promise.all([
  page.waitForURL(`${baseURL}/`),
  page.getByRole("button", { name: "Login", exact: true }).click(),
]);

await capture("/", "01-home-with-event-ticker.png");
await capture("/events", "02-events-calendar.png");
await capture("/guides", "03-guides-index.png");
await capture("/guides/welcome", "04-max-battles-guide.png");
await capture("/admin/content", "05-content-creator-event-tab.png");
await page.getByRole("button", { name: "Guide template", exact: true }).click();
await page.screenshot({
  path: `${outputDirectory}/06-content-creator-guide-tab.png`,
  fullPage: true,
});

await browser.close();
