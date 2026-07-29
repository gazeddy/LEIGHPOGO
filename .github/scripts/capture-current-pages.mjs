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

await page.goto(`${baseURL}/login`, { waitUntil: "networkidle" });
await page.getByLabel("In-Game Name").fill("Angryspanner");
await page.getByLabel("Password").fill("test");
await Promise.all([
  page.waitForURL(`${baseURL}/`),
  page.getByRole("button", { name: "Login", exact: true }).click(),
]);

await page.waitForSelector(".event-ticker");
await page.waitForSelector(".raid-ticker");
await page.waitForTimeout(1500);
await page.screenshot({
  path: `${outputDirectory}/01-main-page.png`,
  fullPage: true,
});

await page.goto(`${baseURL}/events`, { waitUntil: "networkidle" });
await page.waitForSelector(".raid-ticker");
await page.waitForSelector(".events-page");
await page.waitForTimeout(1500);
await page.screenshot({
  path: `${outputDirectory}/02-events-page.png`,
  fullPage: true,
});

await browser.close();
