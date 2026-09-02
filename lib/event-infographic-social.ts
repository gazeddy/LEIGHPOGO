import type {
  PokemonGoEventPokemon,
  PokemonGoEventSummary,
  PokemonGoRaidScheduleBoss,
} from "./events";
import {
  EVENT_INFOGRAPHIC_HEIGHT,
  EVENT_INFOGRAPHIC_WIDTH,
  infographicDateRange,
  prepareEventInfographicAssets,
  type EventInfographicAssets,
} from "./event-infographic";

const MAX_BONUSES = 4;
const MAX_WILD = 8;
const MAX_RAID_DAYS = 5;
const CONTENT_BOTTOM = 1250;

export interface InfographicRaidDay {
  label: string;
  bosses: PokemonGoRaidScheduleBoss[];
}

export interface InfographicRaidScheduleSummary {
  commonBosses: PokemonGoRaidScheduleBoss[];
  days: InfographicRaidDay[];
  hiddenDays: number;
  fallbackBosses: PokemonGoEventPokemon[];
}

function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normaliseKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function wrapText(value: string, maxCharacters: number, maxLines: number): string[] {
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  let wordIndex = 0;

  for (; wordIndex < words.length; wordIndex += 1) {
    const word = words[wordIndex];
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length <= maxCharacters || !current) {
      current = candidate;
      continue;
    }

    lines.push(current);
    current = word;
    if (lines.length >= maxLines - 1) {
      wordIndex += 1;
      break;
    }
  }

  if (current && lines.length < maxLines) lines.push(current);

  if (wordIndex < words.length && lines.length > 0) {
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

function dedupePokemon<T extends PokemonGoEventPokemon>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normaliseKey(item.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function assetFor(assets: EventInfographicAssets, name: string): string | null {
  return assets.pokemon?.[normaliseKey(name)] || null;
}

export function summariseInfographicRaidSchedule(
  event: PokemonGoEventSummary,
): InfographicRaidScheduleSummary {
  const schedule = (event.raidSchedule ?? []).filter((entry) => entry.bosses.length > 0);

  if (schedule.length === 0) {
    return {
      commonBosses: [],
      days: [],
      hiddenDays: 0,
      fallbackBosses: dedupePokemon(event.featuredRaids ?? []),
    };
  }

  const appearances = new Map<string, number>();
  for (const entry of schedule) {
    const seenThisDay = new Set<string>();
    for (const boss of entry.bosses) {
      const key = normaliseKey(boss.name);
      if (!key || seenThisDay.has(key)) continue;
      seenThisDay.add(key);
      appearances.set(key, (appearances.get(key) ?? 0) + 1);
    }
  }

  const commonKeys = new Set<string>();
  if (schedule.length > 1) {
    for (const [key, count] of appearances) {
      if (count === schedule.length) commonKeys.add(key);
    }
  }

  const commonBosses = dedupePokemon(
    schedule[0].bosses.filter((boss) => commonKeys.has(normaliseKey(boss.name))),
  );
  const shownSchedule = schedule.slice(0, MAX_RAID_DAYS);

  return {
    commonBosses,
    days: shownSchedule.map((entry) => ({
      label: entry.label || entry.date,
      bosses: dedupePokemon(
        entry.bosses.filter((boss) => !commonKeys.has(normaliseKey(boss.name))),
      ),
    })),
    hiddenDays: Math.max(0, schedule.length - shownSchedule.length),
    fallbackBosses: [],
  };
}

function sectionFrame(
  y: number,
  height: number,
  title: string,
  accent: string,
  note?: string,
): string {
  return `
    <rect x="42" y="${y}" width="996" height="${height}" rx="24" fill="#0c1730" fill-opacity="0.97" stroke="${accent}" stroke-width="2"/>
    <rect x="42" y="${y}" width="996" height="68" rx="24" fill="${accent}" fill-opacity="0.13"/>
    <text x="70" y="${y + 46}" fill="#ffffff" font-family="Arial, DejaVu Sans, sans-serif" font-size="30" font-weight="900">${xml(title)}</text>
    ${note ? `<text x="1000" y="${y + 44}" fill="${accent}" font-family="Arial, DejaVu Sans, sans-serif" font-size="18" font-weight="800" text-anchor="end">${xml(note)}</text>` : ""}
  `;
}

function bonusSection(bonuses: string[], y: number, height: number): string {
  const shown = bonuses.slice(0, MAX_BONUSES);
  const columns = shown.length === 1 ? 1 : 2;
  const cellWidth = columns === 1 ? 920 : 448;
  const rowHeight = 68;

  const cells = shown.map((bonus, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = 72 + column * 470;
    const top = y + 82 + row * rowHeight;
    const lines = wrapText(bonus, columns === 1 ? 84 : 43, 2);

    return `
      <circle cx="${x + 17}" cy="${top + 20}" r="16" fill="#6f36a7" stroke="#cf91ff" stroke-width="2"/>
      <text x="${x + 17}" y="${top + 27}" fill="#ffffff" font-family="Arial, DejaVu Sans, sans-serif" font-size="20" font-weight="900" text-anchor="middle">★</text>
      ${textLines(lines, x + 48, top + 15, 24, 28, { weight: 800, fill: "#f4edff" })}
    `;
  });

  const hidden = Math.max(0, bonuses.length - shown.length);
  return `${sectionFrame(y, height, "EVENT BONUSES", "#b66cff", `${bonuses.length} total`)}${cells.join("")}${hidden > 0 ? `<text x="1000" y="${y + height - 20}" fill="#bfa2df" font-family="Arial, DejaVu Sans, sans-serif" font-size="17" font-weight="700" text-anchor="end">+${hidden} more bonus${hidden === 1 ? "" : "es"} on LeighPogo</text>` : ""}`;
}

function pokemonListSection(
  title: string,
  accent: string,
  items: PokemonGoEventPokemon[],
  y: number,
  height: number,
  assets: EventInfographicAssets,
): string {
  const shown = dedupePokemon(items).slice(0, MAX_WILD);
  const hidden = Math.max(0, dedupePokemon(items).length - shown.length);
  const columns = 4;
  const cellWidth = 232;
  const rowHeight = 82;

  const cells = shown.map((pokemon, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = 72 + column * cellWidth;
    const top = y + 79 + row * rowHeight;
    const image = assetFor(assets, pokemon.name);
    const nameLines = wrapText(pokemon.name, 15, 2);

    return `
      <circle cx="${x + 31}" cy="${top + 31}" r="31" fill="#11233f" stroke="#526b98" stroke-width="2"/>
      ${image ? `<image href="${image}" x="${x + 4}" y="${top + 4}" width="54" height="54" preserveAspectRatio="xMidYMid meet"/>` : `<text x="${x + 31}" y="${top + 40}" fill="#a7b9d8" font-family="Arial, DejaVu Sans, sans-serif" font-size="27" font-weight="900" text-anchor="middle">${xml(pokemon.name.slice(0, 1).toUpperCase())}</text>`}
      ${pokemon.canBeShiny === true ? `<text x="${x + 55}" y="${top + 10}" fill="#ffe681" font-family="Arial, DejaVu Sans, sans-serif" font-size="20" font-weight="900">✦</text>` : ""}
      ${textLines(nameLines, x + 72, top + 26, 22, 24, { weight: 800, fill: "#f6f9ff" })}
    `;
  });

  return `${sectionFrame(y, height, title, accent, `${items.length} listed`)}${cells.join("")}${hidden > 0 ? `<text x="1000" y="${y + height - 18}" fill="#9fb4d5" font-family="Arial, DejaVu Sans, sans-serif" font-size="17" font-weight="700" text-anchor="end">+${hidden} more on LeighPogo</text>` : ""}`;
}

function bossNames(bosses: PokemonGoRaidScheduleBoss[]): string {
  return bosses.map((boss) => boss.name).join(" • ");
}

function raidDayIcon(
  boss: PokemonGoRaidScheduleBoss | undefined,
  x: number,
  cy: number,
  assets: EventInfographicAssets,
): string {
  if (!boss) return "";
  const image = assetFor(assets, boss.name);
  return `
    <circle cx="${x}" cy="${cy}" r="22" fill="#182644" stroke="#6d5f92" stroke-width="1.5"/>
    ${image ? `<image href="${image}" x="${x - 19}" y="${cy - 19}" width="38" height="38" preserveAspectRatio="xMidYMid meet"/>` : `<text x="${x}" y="${cy + 7}" fill="#d6c9ed" font-family="Arial, DejaVu Sans, sans-serif" font-size="18" font-weight="900" text-anchor="middle">${xml(boss.name.slice(0, 1).toUpperCase())}</text>`}
  `;
}

function raidScheduleSection(
  event: PokemonGoEventSummary,
  y: number,
  height: number,
  assets: EventInfographicAssets,
): string {
  const summary = summariseInfographicRaidSchedule(event);

  if (summary.days.length === 0) {
    return pokemonListSection(
      "RAIDS",
      "#d477ff",
      summary.fallbackBosses,
      y,
      height,
      assets,
    );
  }

  const commonHeight = summary.commonBosses.length > 0 ? 58 : 0;
  const rowsTop = y + 78 + commonHeight;
  const available = Math.max(180, height - 92 - commonHeight);
  const rowHeight = Math.max(42, Math.min(55, Math.floor(available / Math.max(1, summary.days.length))));

  const common = summary.commonBosses.length > 0
    ? `
      <rect x="70" y="${y + 78}" width="940" height="50" rx="14" fill="#4a2e67" fill-opacity="0.35"/>
      <text x="88" y="${y + 110}" fill="#d8a9ff" font-family="Arial, DejaVu Sans, sans-serif" font-size="19" font-weight="900">EVERY DAY</text>
      ${textLines(wrapText(bossNames(summary.commonBosses), 62, 1), 240, y + 110, 22, 24, { weight: 800, fill: "#f5ecff" })}
    `
    : "";

  const rows = summary.days.map((day, index) => {
    const top = rowsTop + index * rowHeight;
    const cy = top + Math.floor(rowHeight / 2);
    const names = day.bosses.length > 0 ? bossNames(day.bosses) : "Same raid lineup";
    const label = wrapText(day.label.replace(/,/g, ""), 20, 1)[0] || day.label;

    return `
      ${index > 0 ? `<line x1="72" y1="${top}" x2="1008" y2="${top}" stroke="#2f3551" stroke-width="1"/>` : ""}
      <text x="84" y="${cy + 8}" fill="#d7a7ff" font-family="Arial, DejaVu Sans, sans-serif" font-size="22" font-weight="900">${xml(label)}</text>
      ${raidDayIcon(day.bosses[0], 298, cy, assets)}
      ${raidDayIcon(day.bosses[1], 346, cy, assets)}
      ${textLines(wrapText(names, 58, 1), 384, cy + 8, 22, 24, { weight: 800, fill: "#f7f3ff" })}
    `;
  });

  return `${sectionFrame(y, height, "RAID SCHEDULE", "#d477ff", `${summary.days.length + summary.hiddenDays} day${summary.days.length + summary.hiddenDays === 1 ? "" : "s"}`)}${common}${rows.join("")}${summary.hiddenDays > 0 ? `<text x="1000" y="${y + height - 16}" fill="#bba4d3" font-family="Arial, DejaVu Sans, sans-serif" font-size="16" font-weight="700" text-anchor="end">+${summary.hiddenDays} more day${summary.hiddenDays === 1 ? "" : "s"} on LeighPogo</text>` : ""}`;
}

function detailSection(event: PokemonGoEventSummary, y: number, height: number): string {
  const description = event.description?.trim() || "Full event details are available on LeighPogo.";
  return `${sectionFrame(y, height, "EVENT DETAILS", "#58a6ff")}${textLines(wrapText(description, 76, 7), 74, y + 112, 27, 36, { weight: 650, fill: "#d6e1f2" })}`;
}

export function buildEventInfographicSocialSvg(
  event: PokemonGoEventSummary,
  assets: EventInfographicAssets = {},
): string {
  const bonuses = event.bonuses ?? [];
  const wild = dedupePokemon(event.wildSpawns ?? []);
  const raidSummary = summariseInfographicRaidSchedule(event);
  const hasRaids = raidSummary.days.length > 0 || raidSummary.fallbackBosses.length > 0;
  const titleLines = wrapText(event.name, 24, 2);
  const descriptionLines = wrapText(event.description ?? "", 48, 2);
  const dateRange = infographicDateRange(event.start, event.end);
  const heroImage = assets.hero || null;
  const brandIcon = assets.brandIcon || null;

  let cursor = 368;
  const gap = 16;
  let sections = "";

  if (bonuses.length > 0) {
    const bonusHeight = 220;
    sections += bonusSection(bonuses, cursor, bonusHeight);
    cursor += bonusHeight + gap;
  }

  if (wild.length > 0) {
    const wildHeight = 250;
    sections += pokemonListSection("WILD SPAWNS", "#73d13d", wild, cursor, wildHeight, assets);
    cursor += wildHeight + gap;
  }

  const remaining = CONTENT_BOTTOM - cursor;
  if (hasRaids && remaining >= 190) {
    sections += raidScheduleSection(event, cursor, remaining, assets);
  } else if (remaining >= 160) {
    sections += detailSection(event, cursor, remaining);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${EVENT_INFOGRAPHIC_WIDTH}" height="${EVENT_INFOGRAPHIC_HEIGHT}" viewBox="0 0 ${EVENT_INFOGRAPHIC_WIDTH} ${EVENT_INFOGRAPHIC_HEIGHT}">
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#041126"/>
      <stop offset="0.52" stop-color="#091b39"/>
      <stop offset="1" stop-color="#190e36"/>
    </linearGradient>
    <linearGradient id="titleGradient" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#66deff"/>
      <stop offset="0.5" stop-color="#91b8ff"/>
      <stop offset="1" stop-color="#ff79cd"/>
    </linearGradient>
    <linearGradient id="heroShade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#07142c" stop-opacity="1"/>
      <stop offset="0.56" stop-color="#07142c" stop-opacity="0.92"/>
      <stop offset="1" stop-color="#07142c" stop-opacity="0.12"/>
    </linearGradient>
    <clipPath id="heroClip"><rect x="42" y="30" width="996" height="320" rx="28"/></clipPath>
    <filter id="softGlow"><feGaussianBlur stdDeviation="24"/></filter>
  </defs>

  <rect width="1080" height="1350" fill="url(#background)"/>
  <circle cx="930" cy="145" r="185" fill="#8b36ff" fill-opacity="0.16" filter="url(#softGlow)"/>
  <circle cx="875" cy="380" r="165" fill="#ed3d9b" fill-opacity="0.11" filter="url(#softGlow)"/>

  <rect x="42" y="30" width="996" height="320" rx="28" fill="#07142c" stroke="#29446f" stroke-width="2"/>
  ${heroImage ? `<image href="${heroImage}" x="548" y="30" width="490" height="320" preserveAspectRatio="xMidYMid slice" clip-path="url(#heroClip)" opacity="0.92"/>` : ""}
  ${heroImage ? `<rect x="42" y="30" width="996" height="320" rx="28" fill="url(#heroShade)"/>` : ""}

  ${brandIcon ? `<image href="${brandIcon}" x="66" y="52" width="52" height="52" preserveAspectRatio="xMidYMid meet"/>` : ""}
  <text x="${brandIcon ? 132 : 68}" y="88" fill="#ffffff" font-family="Arial, DejaVu Sans, sans-serif" font-size="30" font-weight="900" letter-spacing="1">LEIGH<tspan fill="#ffcf35">POGO</tspan></text>
  <rect x="716" y="50" width="294" height="52" rx="26" fill="#091327" stroke="#415b8d" stroke-width="2"/>
  <text x="863" y="84" fill="#f6f9ff" font-family="Arial, DejaVu Sans, sans-serif" font-size="20" font-weight="800" text-anchor="middle">${xml(dateRange)}</text>

  <rect x="68" y="126" width="208" height="38" rx="19" fill="#152847" stroke="#4c79bd"/>
  <text x="172" y="152" fill="#8ec8ff" font-family="Arial, DejaVu Sans, sans-serif" font-size="16" font-weight="900" text-anchor="middle" letter-spacing="1">${xml(event.heading.toUpperCase())}</text>

  <text x="68" y="218" fill="url(#titleGradient)" font-family="Arial, DejaVu Sans, sans-serif" font-size="58" font-weight="900" letter-spacing="-1">${xml(titleLines[0] || "EVENT")}</text>
  ${titleLines[1] ? `<text x="68" y="276" fill="url(#titleGradient)" font-family="Arial, DejaVu Sans, sans-serif" font-size="58" font-weight="900" letter-spacing="-1">${xml(titleLines[1])}</text>` : ""}
  ${descriptionLines.length > 0 ? textLines(descriptionLines, 70, titleLines[1] ? 312 : 274, 22, 28, { weight: 650, fill: "#d5e0ef" }) : ""}

  ${sections}

  <line x1="50" y1="1280" x2="1030" y2="1280" stroke="#2a426b"/>
  <text x="58" y="1320" fill="#ffffff" font-family="Arial, DejaVu Sans, sans-serif" font-size="22" font-weight="900">LEIGH<tspan fill="#ffcf35">POGO</tspan></text>
  <text x="1022" y="1319" fill="#7990b5" font-family="Arial, DejaVu Sans, sans-serif" font-size="15" font-weight="700" text-anchor="end">Event information generated from LeighPogo data</text>
</svg>`;
}

export async function renderEventInfographicSocialPng(
  event: PokemonGoEventSummary,
  fetchImpl: typeof fetch = fetch,
): Promise<Buffer> {
  const assets = await prepareEventInfographicAssets(event, fetchImpl);
  const svg = buildEventInfographicSocialSvg(event, assets);
  const sharpModule = await import("sharp");

  return sharpModule.default(Buffer.from(svg, "utf8"), {
    density: 144,
    limitInputPixels: EVENT_INFOGRAPHIC_WIDTH * EVENT_INFOGRAPHIC_HEIGHT * 4,
  })
    .png({ compressionLevel: 8, adaptiveFiltering: true })
    .toBuffer();
}
