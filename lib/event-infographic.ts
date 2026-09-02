import fs from "node:fs/promises";
import path from "node:path";
import type {
  PokemonGoEventPokemon,
  PokemonGoEventSummary,
} from "./events";

export const EVENT_INFOGRAPHIC_WIDTH = 1080;
export const EVENT_INFOGRAPHIC_HEIGHT = 1350;

const MAX_BONUSES = 5;
const MAX_WILD = 8;
const MAX_RAIDS = 8;
const MAX_REMOTE_ASSET_BYTES = 4 * 1024 * 1024;
const ALLOWED_REMOTE_IMAGE_HOSTS = new Set(["cdn.leekduck.com"]);

interface InfographicPokemon extends PokemonGoEventPokemon {
  subtitle?: string | null;
}

export interface EventInfographicAssets {
  brandIcon?: string | null;
  hero?: string | null;
  pokemon?: Record<string, string | null>;
}

function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapText(value: string, maxCharacters: number, maxLines: number): string[] {
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharacters || !current) {
      current = candidate;
      continue;
    }

    lines.push(current);
    current = word;
    if (lines.length >= maxLines - 1) break;
  }

  if (current && lines.length < maxLines) lines.push(current);

  const consumedWords = lines.join(" ").split(" ").filter(Boolean).length;
  if (consumedWords < words.length && lines.length > 0) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.…]+$/, "")}…`;
  }

  return lines;
}

function textLines(
  lines: string[],
  x: number,
  y: number,
  fontSize: number,
  lineHeight: number,
  options: { weight?: number; fill?: string; anchor?: "start" | "middle" } = {},
): string {
  const weight = options.weight ?? 700;
  const fill = options.fill ?? "#f7fbff";
  const anchor = options.anchor ?? "start";

  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * lineHeight}" fill="${fill}" font-family="Arial, DejaVu Sans, sans-serif" font-size="${fontSize}" font-weight="${weight}" text-anchor="${anchor}">${xml(line)}</text>`,
    )
    .join("");
}

function dateForDisplay(value: string): { date: Date; timeZone: string } {
  const includesTimeZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  return {
    date: new Date(includesTimeZone ? value : `${value}Z`),
    timeZone: includesTimeZone ? "Europe/London" : "UTC",
  };
}

function dateParts(value: string): { day: number; month: string; year: number } {
  const { date, timeZone } = dateForDisplay(value);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).formatToParts(date);
  const byType = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );

  return {
    day: Number(byType.day),
    month: String(byType.month || "").toUpperCase(),
    year: Number(byType.year),
  };
}

export function infographicDateRange(start: string, end: string): string {
  const left = dateParts(start);
  const right = dateParts(end);

  if (left.year === right.year && left.month === right.month && left.day === right.day) {
    return `${left.day} ${left.month} ${left.year}`;
  }

  if (left.year === right.year && left.month === right.month) {
    return `${left.day}–${right.day} ${left.month} ${left.year}`;
  }

  if (left.year === right.year) {
    return `${left.day} ${left.month} – ${right.day} ${right.month} ${left.year}`;
  }

  return `${left.day} ${left.month} ${left.year} – ${right.day} ${right.month} ${right.year}`;
}

function pokemonKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function infographicRaidPokemon(event: PokemonGoEventSummary): InfographicPokemon[] {
  const result: InfographicPokemon[] = [];
  const seen = new Set<string>();

  for (const entry of event.raidSchedule ?? []) {
    for (const boss of entry.bosses) {
      const key = pokemonKey(boss.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push({
        name: boss.name,
        image: boss.image,
        canBeShiny: boss.canBeShiny,
        subtitle: boss.raidType || entry.label || null,
      });
    }
  }

  for (const boss of event.featuredRaids ?? []) {
    const key = pokemonKey(boss.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ ...boss, subtitle: null });
  }

  return result;
}

function dedupePokemon(items: PokemonGoEventPokemon[]): PokemonGoEventPokemon[] {
  const seen = new Set<string>();
  return items.filter((pokemon) => {
    const key = pokemonKey(pokemon.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function assetKey(name: string): string {
  return pokemonKey(name);
}

function sectionChrome(
  y: number,
  height: number,
  title: string,
  accent: string,
  count?: number,
): string {
  return `
    <rect x="42" y="${y}" width="996" height="${height}" rx="24" fill="#0c1730" fill-opacity="0.96" stroke="${accent}" stroke-width="2"/>
    <path d="M42 ${y + 58} H360 L390 ${y + 86} H42 Z" fill="${accent}" fill-opacity="0.24"/>
    <text x="70" y="${y + 55}" fill="#ffffff" font-family="Arial, DejaVu Sans, sans-serif" font-size="31" font-weight="900">${xml(title)}</text>
    ${count !== undefined ? `<text x="1002" y="${y + 54}" fill="${accent}" font-family="Arial, DejaVu Sans, sans-serif" font-size="25" font-weight="800" text-anchor="end">${count}</text>` : ""}
  `;
}

function bonusTiles(bonuses: string[], y: number, height: number): string {
  const shown = bonuses.slice(0, MAX_BONUSES);
  const cellWidth = 940 / Math.max(1, shown.length);

  return shown
    .map((bonus, index) => {
      const cx = 70 + cellWidth * index + cellWidth / 2;
      const lines = wrapText(bonus, 18, 3);
      return `
        ${index > 0 ? `<line x1="${70 + cellWidth * index}" y1="${y + 92}" x2="${70 + cellWidth * index}" y2="${y + height - 28}" stroke="#33456c" stroke-width="1"/>` : ""}
        <circle cx="${cx}" cy="${y + 119}" r="39" fill="url(#bonusGlow)" stroke="#bc78ff" stroke-width="2"/>
        <text x="${cx}" y="${y + 132}" fill="#ffffff" font-family="Arial, DejaVu Sans, sans-serif" font-size="35" font-weight="900" text-anchor="middle">★</text>
        ${textLines(lines, cx, y + 185, 20, 25, { weight: 800, fill: "#eef5ff", anchor: "middle" })}
      `;
    })
    .join("");
}

function pokemonTiles(
  items: InfographicPokemon[],
  y: number,
  height: number,
  assets: EventInfographicAssets,
  limit: number,
): string {
  const shown = items.slice(0, limit);
  const hiddenCount = Math.max(0, items.length - shown.length);
  const availableWidth = 930;
  const tileCount = shown.length + (hiddenCount > 0 ? 1 : 0);
  const cellWidth = availableWidth / Math.max(1, tileCount);

  const tiles = shown.map((pokemon, index) => {
    const cx = 75 + index * cellWidth + cellWidth / 2;
    const image = assets.pokemon?.[assetKey(pokemon.name)] || null;
    const nameLines = wrapText(pokemon.name, 15, 2);
    const subtitle = pokemon.subtitle ? wrapText(pokemon.subtitle, 14, 1)[0] : null;

    return `
      <circle cx="${cx}" cy="${y + 145}" r="48" fill="#10213e" stroke="#576c9b" stroke-width="2"/>
      ${image
        ? `<image href="${image}" x="${cx - 43}" y="${y + 102}" width="86" height="86" preserveAspectRatio="xMidYMid meet"/>`
        : `<text x="${cx}" y="${y + 158}" fill="#9eb3d9" font-family="Arial, DejaVu Sans, sans-serif" font-size="35" font-weight="900" text-anchor="middle">${xml(pokemon.name.slice(0, 1).toUpperCase())}</text>`}
      ${pokemon.canBeShiny === true ? `<text x="${cx + 36}" y="${y + 112}" fill="#ffe889" font-family="Arial, DejaVu Sans, sans-serif" font-size="25" text-anchor="middle">✦</text>` : ""}
      ${textLines(nameLines, cx, y + 217, 18, 21, { weight: 800, fill: "#f4f8ff", anchor: "middle" })}
      ${subtitle ? `<text x="${cx}" y="${y + height - 26}" fill="#8eb8ff" font-family="Arial, DejaVu Sans, sans-serif" font-size="14" font-weight="700" text-anchor="middle">${xml(subtitle)}</text>` : ""}
    `;
  });

  if (hiddenCount > 0) {
    const cx = 75 + shown.length * cellWidth + cellWidth / 2;
    tiles.push(`
      <rect x="${cx - 48}" y="${y + 97}" width="96" height="96" rx="24" fill="#172a4d" stroke="#6aa8ff" stroke-width="2" stroke-dasharray="7 5"/>
      <text x="${cx}" y="${y + 145}" fill="#ffffff" font-family="Arial, DejaVu Sans, sans-serif" font-size="24" font-weight="900" text-anchor="middle">+${hiddenCount}</text>
      <text x="${cx}" y="${y + 174}" fill="#9fc9ff" font-family="Arial, DejaVu Sans, sans-serif" font-size="15" font-weight="800" text-anchor="middle">MORE</text>
    `);
  }

  return tiles.join("");
}

function descriptionPanel(event: PokemonGoEventSummary, y: number, height: number): string {
  const description = event.description?.trim() || "Full event details are available on LeighPogo.";
  const lines = wrapText(description, 68, Math.max(3, Math.floor((height - 120) / 30)));
  return `
    ${sectionChrome(y, height, "EVENT DETAILS", "#58a6ff")}
    ${textLines(lines, 72, y + 124, 24, 32, { weight: 600, fill: "#c8d7ef" })}
  `;
}

export function buildEventInfographicSvg(
  event: PokemonGoEventSummary,
  assets: EventInfographicAssets = {},
): string {
  const bonuses = event.bonuses ?? [];
  const wild = dedupePokemon(event.wildSpawns ?? []);
  const raids = infographicRaidPokemon(event);
  const titleLines = wrapText(event.name, 22, 2);
  const descriptionLines = wrapText(event.description ?? "", 46, 3);
  const dateRange = infographicDateRange(event.start, event.end);
  const heroImage = assets.hero || null;
  const brandIcon = assets.brandIcon || null;

  const bonusY = 455;
  const bonusHeight = bonuses.length > 0 ? 205 : 0;
  const contentTop = bonuses.length > 0 ? 686 : 475;
  const contentBottom = 1254;
  const hasWild = wild.length > 0;
  const hasRaids = raids.length > 0;
  const gap = 22;
  const contentHeight = contentBottom - contentTop;
  const splitHeight = Math.floor((contentHeight - gap) / 2);

  let lowerSections = "";
  if (hasWild && hasRaids) {
    lowerSections += sectionChrome(contentTop, splitHeight, "WILD SPAWNS", "#73d13d", wild.length);
    lowerSections += pokemonTiles(wild.map((item) => ({ ...item, subtitle: null })), contentTop, splitHeight, assets, MAX_WILD);
    const raidY = contentTop + splitHeight + gap;
    lowerSections += sectionChrome(raidY, splitHeight, "RAIDS", "#d477ff", raids.length);
    lowerSections += pokemonTiles(raids, raidY, splitHeight, assets, MAX_RAIDS);
  } else if (hasWild) {
    lowerSections += sectionChrome(contentTop, contentHeight, "WILD SPAWNS", "#73d13d", wild.length);
    lowerSections += pokemonTiles(wild.map((item) => ({ ...item, subtitle: null })), contentTop + 78, contentHeight - 78, assets, MAX_WILD);
  } else if (hasRaids) {
    lowerSections += sectionChrome(contentTop, contentHeight, "RAIDS", "#d477ff", raids.length);
    lowerSections += pokemonTiles(raids, contentTop + 78, contentHeight - 78, assets, MAX_RAIDS);
  } else {
    lowerSections += descriptionPanel(event, contentTop, contentHeight);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${EVENT_INFOGRAPHIC_WIDTH}" height="${EVENT_INFOGRAPHIC_HEIGHT}" viewBox="0 0 ${EVENT_INFOGRAPHIC_WIDTH} ${EVENT_INFOGRAPHIC_HEIGHT}">
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#041126"/>
      <stop offset="0.5" stop-color="#081a38"/>
      <stop offset="1" stop-color="#180d35"/>
    </linearGradient>
    <linearGradient id="titleGradient" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#64ddff"/>
      <stop offset="0.48" stop-color="#8ab6ff"/>
      <stop offset="1" stop-color="#ff75ca"/>
    </linearGradient>
    <radialGradient id="bonusGlow">
      <stop offset="0" stop-color="#9a4dff"/>
      <stop offset="1" stop-color="#39206d"/>
    </radialGradient>
    <linearGradient id="heroShade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#07142c" stop-opacity="1"/>
      <stop offset="0.58" stop-color="#07142c" stop-opacity="0.92"/>
      <stop offset="1" stop-color="#07142c" stop-opacity="0.08"/>
    </linearGradient>
    <clipPath id="heroClip"><rect x="42" y="38" width="996" height="392" rx="28"/></clipPath>
    <filter id="softGlow"><feGaussianBlur stdDeviation="26"/></filter>
  </defs>

  <rect width="1080" height="1350" fill="url(#background)"/>
  <circle cx="925" cy="150" r="180" fill="#8b36ff" fill-opacity="0.17" filter="url(#softGlow)"/>
  <circle cx="860" cy="390" r="170" fill="#ed3d9b" fill-opacity="0.12" filter="url(#softGlow)"/>

  <rect x="42" y="38" width="996" height="392" rx="28" fill="#07142c" stroke="#29446f" stroke-width="2"/>
  ${heroImage ? `<image href="${heroImage}" x="545" y="38" width="493" height="392" preserveAspectRatio="xMidYMid slice" clip-path="url(#heroClip)" opacity="0.92"/>` : ""}
  ${heroImage ? `<rect x="42" y="38" width="996" height="392" rx="28" fill="url(#heroShade)"/>` : ""}

  ${brandIcon ? `<image href="${brandIcon}" x="66" y="64" width="56" height="56" preserveAspectRatio="xMidYMid meet"/>` : ""}
  <text x="${brandIcon ? 136 : 68}" y="103" fill="#ffffff" font-family="Arial, DejaVu Sans, sans-serif" font-size="31" font-weight="900" letter-spacing="1">LEIGH<tspan fill="#ffcf35">POGO</tspan></text>
  <rect x="720" y="63" width="286" height="58" rx="29" fill="#091327" stroke="#415b8d" stroke-width="2"/>
  <text x="863" y="100" fill="#f6f9ff" font-family="Arial, DejaVu Sans, sans-serif" font-size="20" font-weight="800" text-anchor="middle">${xml(dateRange)}</text>

  <rect x="68" y="146" width="190" height="39" rx="19" fill="#152847" stroke="#4c79bd"/>
  <text x="163" y="172" fill="#8ec8ff" font-family="Arial, DejaVu Sans, sans-serif" font-size="16" font-weight="900" text-anchor="middle" letter-spacing="1">${xml(event.heading.toUpperCase())}</text>

  <text x="68" y="235" fill="url(#titleGradient)" font-family="Arial, DejaVu Sans, sans-serif" font-size="67" font-weight="900" letter-spacing="-1">${titleLines.length > 0 ? xml(titleLines[0]) : "EVENT"}</text>
  ${titleLines[1] ? `<text x="68" y="304" fill="url(#titleGradient)" font-family="Arial, DejaVu Sans, sans-serif" font-size="67" font-weight="900" letter-spacing="-1">${xml(titleLines[1])}</text>` : ""}
  ${descriptionLines.length > 0 ? textLines(descriptionLines, 70, titleLines[1] ? 348 : 314, 21, 29, { weight: 600, fill: "#d1dced" }) : ""}

  ${bonuses.length > 0 ? `${sectionChrome(bonusY, bonusHeight, "EVENT BONUSES", "#b66cff", bonuses.length)}${bonusTiles(bonuses, bonusY, bonusHeight)}` : ""}
  ${lowerSections}

  <line x1="50" y1="1282" x2="1030" y2="1282" stroke="#2a426b"/>
  <text x="58" y="1322" fill="#ffffff" font-family="Arial, DejaVu Sans, sans-serif" font-size="22" font-weight="900">LEIGH<tspan fill="#ffcf35">POGO</tspan></text>
  <text x="1022" y="1321" fill="#7990b5" font-family="Arial, DejaVu Sans, sans-serif" font-size="15" font-weight="700" text-anchor="end">Event information generated from LeighPogo data</text>
</svg>`;
}

function mimeForPath(value: string): string | null {
  const clean = value.split("?")[0].toLowerCase();
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
  if (clean.endsWith(".webp")) return "image/webp";
  return null;
}

async function localAssetDataUri(value: string): Promise<string | null> {
  const relative = value.replace(/^\/+/, "");
  const publicRoot = path.resolve(process.cwd(), "public");
  const assetPath = path.resolve(publicRoot, relative);
  if (!assetPath.startsWith(`${publicRoot}${path.sep}`)) return null;
  const mime = mimeForPath(assetPath);
  if (!mime) return null;

  try {
    const buffer = await fs.readFile(assetPath);
    if (buffer.length > MAX_REMOTE_ASSET_BYTES) return null;
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

async function remoteAssetDataUri(
  value: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || !ALLOWED_REMOTE_IMAGE_HOSTS.has(url.hostname.toLowerCase())) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetchImpl(url.toString(), {
      signal: controller.signal,
      headers: { Accept: "image/png,image/jpeg,image/webp" },
    });
    if (!response.ok) return null;

    const mime = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (!mime || !["image/png", "image/jpeg", "image/webp"].includes(mime)) return null;

    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_REMOTE_ASSET_BYTES) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_REMOTE_ASSET_BYTES) return null;
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function assetDataUri(
  value: string | null | undefined,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return localAssetDataUri(value);
  return remoteAssetDataUri(value, fetchImpl);
}

export async function prepareEventInfographicAssets(
  event: PokemonGoEventSummary,
  fetchImpl: typeof fetch = fetch,
): Promise<EventInfographicAssets> {
  const wild = dedupePokemon(event.wildSpawns ?? []).slice(0, MAX_WILD);
  const raids = infographicRaidPokemon(event).slice(0, MAX_RAIDS);
  const pokemon = [...wild, ...raids];
  const entries = await Promise.all(
    pokemon.map(async (item) => [assetKey(item.name), await assetDataUri(item.image, fetchImpl)] as const),
  );

  return {
    brandIcon: await assetDataUri("/pwa-icon-192.png", fetchImpl),
    hero: await assetDataUri(event.image, fetchImpl),
    pokemon: Object.fromEntries(entries),
  };
}

export async function renderEventInfographicPng(
  event: PokemonGoEventSummary,
  fetchImpl: typeof fetch = fetch,
): Promise<Buffer> {
  const assets = await prepareEventInfographicAssets(event, fetchImpl);
  const svg = buildEventInfographicSvg(event, assets);
  const sharpModule = await import("sharp");

  return sharpModule.default(Buffer.from(svg, "utf8"), {
    density: 144,
    limitInputPixels: EVENT_INFOGRAPHIC_WIDTH * EVENT_INFOGRAPHIC_HEIGHT * 4,
  })
    .png({ compressionLevel: 8, adaptiveFiltering: true })
    .toBuffer();
}

export function infographicFilename(event: Pick<PokemonGoEventSummary, "eventID">): string {
  const safe = event.eventID
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "event";

  return `${safe}-leighpogo.png`;
}
