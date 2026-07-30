import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const GUIDES_DIRECTORY =
  process.env.GUIDES_DIRECTORY?.trim() ||
  path.join(process.cwd(), "content", "guides");

export interface GuideFrontMatter {
  title: string;
  description: string;
  date?: string;
  order?: number;
  eventTypes?: string[];
  tags?: string[];
  series?: string;
  seriesOrder?: number;
  relatedGuides?: string[];
  coverImage?: string;
  coverImageAlt?: string;
}

export interface GuideSummary extends GuideFrontMatter {
  slug: string;
}

export interface Guide extends GuideSummary {
  content: string;
}

export interface GuideRelationships {
  previousGuide: GuideSummary | null;
  nextGuide: GuideSummary | null;
  relatedGuides: GuideSummary[];
  seriesTitle: string | null;
  seriesPosition: number | null;
  seriesLength: number;
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

function normaliseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  return values.length > 0 ? values : undefined;
}

function normaliseSlug(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const slug = value.trim().toLowerCase();

  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : undefined;
}

function normaliseSlugArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const slugs = Array.from(
    new Set(
      value
        .map(normaliseSlug)
        .filter((slug): slug is string => slug !== undefined),
    ),
  );

  return slugs.length > 0 ? slugs : undefined;
}

function normaliseFrontMatter(
  data: Record<string, unknown>,
  slug: string,
): GuideFrontMatter {
  const frontMatter: GuideFrontMatter = {
    title:
      typeof data.title === "string" && data.title.trim()
        ? data.title
        : titleFromSlug(slug),
    description:
      typeof data.description === "string" ? data.description : "",
  };
  const date = normaliseDate(data.date);
  const eventTypes = normaliseStringArray(data.eventTypes);
  const tags = normaliseStringArray(data.tags);
  const series = normaliseSlug(data.series);
  const relatedGuides = normaliseSlugArray(data.relatedGuides)?.filter(
    (relatedSlug) => relatedSlug !== slug,
  );
  const coverImage =
    typeof data.coverImage === "string" && data.coverImage.trim()
      ? data.coverImage.trim()
      : undefined;
  const coverImageAlt =
    typeof data.coverImageAlt === "string" && data.coverImageAlt.trim()
      ? data.coverImageAlt.trim()
      : undefined;

  if (date) {
    frontMatter.date = date;
  }

  if (typeof data.order === "number") {
    frontMatter.order = data.order;
  }

  if (eventTypes) {
    frontMatter.eventTypes = eventTypes;
  }

  if (tags) {
    frontMatter.tags = tags;
  }

  if (series) {
    frontMatter.series = series;
  }

  if (
    series &&
    typeof data.seriesOrder === "number" &&
    Number.isInteger(data.seriesOrder) &&
    data.seriesOrder > 0
  ) {
    frontMatter.seriesOrder = data.seriesOrder;
  }

  if (relatedGuides && relatedGuides.length > 0) {
    frontMatter.relatedGuides = relatedGuides;
  }

  if (coverImage) {
    frontMatter.coverImage = coverImage;
    frontMatter.coverImageAlt = coverImageAlt || frontMatter.title;
  }

  return frontMatter;
}

function compareGuides(left: GuideSummary, right: GuideSummary): number {
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
}

function compareSeriesGuides(left: GuideSummary, right: GuideSummary): number {
  const seriesOrderDifference =
    (left.seriesOrder ?? Number.MAX_SAFE_INTEGER) -
    (right.seriesOrder ?? Number.MAX_SAFE_INTEGER);

  return seriesOrderDifference !== 0
    ? seriesOrderDifference
    : compareGuides(left, right);
}

export function getGuidesDirectory(): string {
  return GUIDES_DIRECTORY;
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
    .sort(compareGuides)
    .map(({ content: _content, ...guide }) => guide);
}

export function getGuideRelationships(
  guide: GuideSummary,
  guides: GuideSummary[] = getAllGuides(),
): GuideRelationships {
  const guideBySlug = new Map(guides.map((item) => [item.slug, item]));
  const relatedGuides = (guide.relatedGuides ?? [])
    .map((slug) => guideBySlug.get(slug))
    .filter(
      (item): item is GuideSummary =>
        item !== undefined && item.slug !== guide.slug,
    );

  if (!guide.series) {
    return {
      previousGuide: null,
      nextGuide: null,
      relatedGuides,
      seriesTitle: null,
      seriesPosition: null,
      seriesLength: 0,
    };
  }

  const seriesGuides = guides
    .filter((item) => item.series === guide.series)
    .sort(compareSeriesGuides);
  const currentIndex = seriesGuides.findIndex((item) => item.slug === guide.slug);

  return {
    previousGuide: currentIndex > 0 ? seriesGuides[currentIndex - 1] : null,
    nextGuide:
      currentIndex >= 0 && currentIndex < seriesGuides.length - 1
        ? seriesGuides[currentIndex + 1]
        : null,
    relatedGuides,
    seriesTitle: titleFromSlug(guide.series),
    seriesPosition: currentIndex >= 0 ? currentIndex + 1 : null,
    seriesLength: seriesGuides.length,
  };
}
