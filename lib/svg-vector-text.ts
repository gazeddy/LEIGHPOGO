export type VectorTextAnchor = "start" | "middle" | "end";

export interface VectorTextOptions {
  fill?: string;
  anchor?: VectorTextAnchor;
  letterSpacing?: number;
  opacity?: number;
}

type Glyph = readonly string[];

const FONT: Record<string, Glyph> = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00110", "00110"],
  ",": ["00000", "00000", "00000", "00000", "00110", "00110", "00100"],
  ":": ["00000", "00110", "00110", "00000", "00110", "00110", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "'": ["00100", "00100", "00000", "00000", "00000", "00000", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "#": ["01010", "11111", "01010", "01010", "11111", "01010", "01010"],
  "%": ["11001", "11010", "00100", "01000", "10110", "00110", "00000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "*": ["00100", "10101", "01110", "11111", "01110", "10101", "00100"],
  "=": ["00000", "11111", "00000", "11111", "00000", "00000", "00000"],
  "_": ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
};

function xmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function normaliseVectorText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[×✕]/g, "X")
    .replace(/[–—−]/g, "-")
    .replace(/[•·]/g, "*")
    .replace(/[★☆✦✧]/g, "*")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .toUpperCase();
}

function glyphFor(character: string): Glyph {
  return FONT[character] ?? FONT["?"];
}

function textMetrics(value: string, fontSize: number, letterSpacing?: number) {
  const text = normaliseVectorText(value);
  const scale = fontSize / 8;
  const spacing = letterSpacing ?? scale;
  const glyphWidth = 5 * scale;
  const width = text.length > 0
    ? text.length * glyphWidth + Math.max(0, text.length - 1) * spacing
    : 0;

  return { text, scale, spacing, glyphWidth, width };
}

export function measureVectorText(
  value: string,
  fontSize: number,
  letterSpacing?: number,
): number {
  return textMetrics(value, fontSize, letterSpacing).width;
}

function glyphPath(glyph: Glyph, x: number, top: number, scale: number): string {
  const commands: string[] = [];

  glyph.forEach((row, rowIndex) => {
    let column = 0;
    while (column < row.length) {
      if (row[column] !== "1") {
        column += 1;
        continue;
      }

      const start = column;
      while (column < row.length && row[column] === "1") column += 1;
      const run = column - start;
      const px = x + start * scale;
      const py = top + rowIndex * scale;
      const width = run * scale;
      commands.push(`M${px.toFixed(2)} ${py.toFixed(2)}h${width.toFixed(2)}v${scale.toFixed(2)}h-${width.toFixed(2)}z`);
    }
  });

  return commands.join("");
}

export function svgVectorText(
  value: string,
  x: number,
  baselineY: number,
  fontSize: number,
  options: VectorTextOptions = {},
): string {
  const { text, scale, spacing, glyphWidth, width } = textMetrics(
    value,
    fontSize,
    options.letterSpacing,
  );
  if (!text) return "";

  const anchor = options.anchor ?? "start";
  const startX = anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
  const top = baselineY - 7 * scale;
  let cursor = startX;
  const paths: string[] = [];

  for (const character of text) {
    const glyph = glyphFor(character);
    const path = glyphPath(glyph, cursor, top, scale);
    if (path) paths.push(path);
    cursor += glyphWidth + spacing;
  }

  const opacity = options.opacity === undefined ? "" : ` opacity="${options.opacity}"`;
  return `<g aria-label="${xmlAttribute(value)}" data-vector-text="${xmlAttribute(value)}"><path d="${paths.join("")}" fill="${options.fill ?? "#f7fbff"}"${opacity}/></g>`;
}

export function svgVectorTextLines(
  lines: string[],
  x: number,
  baselineY: number,
  fontSize: number,
  lineHeight: number,
  options: VectorTextOptions = {},
): string {
  return lines
    .map((line, index) =>
      svgVectorText(line, x, baselineY + index * lineHeight, fontSize, options),
    )
    .join("");
}
