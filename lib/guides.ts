import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const GUIDES_DIRECTORY = path.join(process.cwd(), "content", "guides");

export interface GuideFrontMatter {
  title: string;
  description: string;
  date?: string;
  order?: number;
}

export interface GuideSummary extends GuideFrontMatter {
  slug: string;
}

export interface Guide extends GuideSummary {
  content: string;
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normaliseDate(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  return typeof value === "string" && value.trim() ? value : undefined;
}

function normaliseFrontMatter(
  data: Record<string, unknown>,
  slug: string,
): GuideFrontMatter {
  return {
    title:
      typeof data.title === "string" && data.title.trim()
        ? data.title
        : titleFromSlug(slug),
    description:
      typeof data.description === "string" ? data.description : "",
    date: normaliseDate(data.date),
    order: typeof data.order === "number" ? data.order : undefined,
  };
}

export function getGuideSlugs(): string[] {
  if (!fs.existsSync(GUIDES_DIRECTORY)) {
    return [];
  }

  return fs
    .readdirSync(GUIDES_DIRECTORY)
    .filter((fileName) => fileName.endsWith(".md"))
    .map((fileName) => fileName.replace(/\.md$/, ""));
}

export function getGuideBySlug(slug: string): Guide | null {
  const safeSlug = path.basename(slug);

  if (!safeSlug || safeSlug !== slug) {
    return null;
  }

  const fullPath = path.join(GUIDES_DIRECTORY, `${safeSlug}.md`);

  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const source = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(source);

  return {
    slug: safeSlug,
    ...normaliseFrontMatter(data, safeSlug),
    content,
  };
}

export function getAllGuides(): GuideSummary[] {
  return getGuideSlugs()
    .map(getGuideBySlug)
    .filter((guide): guide is Guide => guide !== null)
    .sort((left, right) => {
      const orderDifference =
        (left.order ?? Number.MAX_SAFE_INTEGER) -
        (right.order ?? Number.MAX_SAFE_INTEGER);

      if (orderDifference !== 0) {
        return orderDifference;
      }

      if (left.date && right.date && left.date !== right.date) {
        return right.date.localeCompare(left.date);
      }

      return left.title.localeCompare(right.title);
    })
    .map(({ content: _content, ...guide }) => guide);
}
