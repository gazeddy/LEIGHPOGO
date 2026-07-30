import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { NextApiRequest, NextApiResponse } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import {
  getAllGuides,
  getGuideBySlug,
  getGuidesDirectory,
} from "../../../../lib/guides";
import { authOptions } from "../../auth/[...nextauth]";

interface GuideInput {
  title?: unknown;
  slug?: unknown;
  description?: unknown;
  date?: unknown;
  order?: unknown;
  eventTypes?: unknown;
  tags?: unknown;
  series?: unknown;
  seriesOrder?: unknown;
  relatedGuides?: unknown;
  coverImage?: unknown;
  coverImageAlt?: unknown;
  body?: unknown;
}

type GuideResponse =
  | { message: string; slug: string; url: string }
  | { error: string };

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }

  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function validateImageUrl(value: unknown): string | undefined {
  const image = optionalString(value);

  if (!image) {
    return undefined;
  }

  if (image.startsWith("/uploads/guides/")) {
    return image;
  }

  let parsed: URL;

  try {
    parsed = new URL(image);
  } catch {
    throw new Error("Cover image must be a valid local or web URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Cover image must use HTTP or HTTPS");
  }

  return parsed.toString();
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 30);
}

function slugValue(value: unknown, field: string): string | undefined {
  const slug = optionalString(value)?.toLowerCase();

  if (!slug) {
    return undefined;
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`${field} may only contain lowercase letters, numbers and hyphens`);
  }

  return slug;
}

function optionalWholeNumber(
  value: unknown,
  field: string,
  minimum: number,
): number | undefined {
  if (value === "" || value === undefined || value === null) {
    return undefined;
  }

  const number = Number(value);

  if (!Number.isInteger(number) || number < minimum) {
    throw new Error(`${field} must be a whole number of ${minimum} or more`);
  }

  return number;
}

function validateRelationships(
  input: GuideInput,
  slug: string,
  guides = getAllGuides(),
): {
  series?: string;
  seriesOrder?: number;
  relatedGuides: string[];
} {
  const series = slugValue(input.series, "Series");
  const seriesOrder = optionalWholeNumber(
    input.seriesOrder,
    "Series position",
    1,
  );

  if (seriesOrder !== undefined && !series) {
    throw new Error("Choose a series before setting a series position");
  }

  const availableGuideSlugs = new Set(guides.map((guide) => guide.slug));
  const relatedGuides = stringArray(input.relatedGuides)
    .filter((relatedSlug) => relatedSlug !== slug)
    .map((relatedSlug) => {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(relatedSlug)) {
        throw new Error(`Related guide slug is invalid: ${relatedSlug}`);
      }

      if (!availableGuideSlugs.has(relatedSlug)) {
        throw new Error(`Related guide does not exist: ${relatedSlug}`);
      }

      return relatedSlug;
    });

  return { series, seriesOrder, relatedGuides };
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function renderArray(name: string, values: string[]): string[] {
  if (values.length === 0) {
    return [];
  }

  return [name + ":", ...values.map((value) => `  - ${yamlString(value)}`)];
}

function renderGuide(input: {
  title: string;
  description: string;
  date: string;
  order?: number;
  eventTypes: string[];
  tags: string[];
  series?: string;
  seriesOrder?: number;
  relatedGuides: string[];
  coverImage?: string;
  coverImageAlt?: string;
  body: string;
}): string {
  const frontMatter = [
    "---",
    `title: ${yamlString(input.title)}`,
    `description: ${yamlString(input.description)}`,
    `date: ${yamlString(input.date)}`,
  ];

  if (input.coverImage) {
    frontMatter.push(`coverImage: ${yamlString(input.coverImage)}`);
    frontMatter.push(`coverImageAlt: ${yamlString(input.coverImageAlt || input.title)}`);
  }

  if (input.order !== undefined) {
    frontMatter.push(`order: ${input.order}`);
  }

  if (input.series) {
    frontMatter.push(`series: ${yamlString(input.series)}`);
  }

  if (input.seriesOrder !== undefined) {
    frontMatter.push(`seriesOrder: ${input.seriesOrder}`);
  }

  frontMatter.push(...renderArray("eventTypes", input.eventTypes));
  frontMatter.push(...renderArray("tags", input.tags));
  frontMatter.push(...renderArray("relatedGuides", input.relatedGuides));
  frontMatter.push("---", "", input.body.trim(), "");

  return frontMatter.join("\n");
}

async function createGuide(
  input: GuideInput,
  res: NextApiResponse<GuideResponse>,
) {
  const title = requiredString(input.title, "Title");
  const slug = requiredString(input.slug, "Slug").toLowerCase();
  const description = requiredString(input.description, "Description");
  const body = requiredString(input.body, "Guide body");

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Slug may only contain lowercase letters, numbers and hyphens");
  }

  if (getGuideBySlug(slug)) {
    return res.status(409).json({ error: "A guide with that slug already exists" });
  }

  const order = optionalWholeNumber(input.order, "Order", 0);
  const coverImage = validateImageUrl(input.coverImage);
  const coverImageAlt = optionalString(input.coverImageAlt);

  if (coverImage && !coverImageAlt) {
    throw new Error("Cover image alternative text is required");
  }

  const relationships = validateRelationships(input, slug);
  const date = optionalString(input.date) || new Date().toISOString().slice(0, 10);
  const guideSource = renderGuide({
    title,
    description,
    date,
    order,
    eventTypes: stringArray(input.eventTypes),
    tags: stringArray(input.tags),
    coverImage,
    coverImageAlt,
    ...relationships,
    body,
  });
  const directory = getGuidesDirectory();
  const guidePath = path.join(directory, `${slug}.md`);

  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(guidePath, guideSource, { encoding: "utf8", flag: "wx" });

  return res.status(201).json({
    message: "Guide created successfully.",
    slug,
    url: `/guides/${slug}`,
  });
}

async function updateGuideRelationships(
  input: GuideInput,
  res: NextApiResponse<GuideResponse>,
) {
  const slug = requiredString(input.slug, "Slug").toLowerCase();

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Slug may only contain lowercase letters, numbers and hyphens");
  }

  if (!getGuideBySlug(slug)) {
    return res.status(404).json({ error: "Guide not found" });
  }

  const relationships = validateRelationships(input, slug);
  const guidePath = path.join(getGuidesDirectory(), `${slug}.md`);
  const source = await fs.readFile(guidePath, "utf8");
  const parsed = matter(source);
  const data = { ...parsed.data };

  if (relationships.series) {
    data.series = relationships.series;
  } else {
    delete data.series;
  }

  if (relationships.seriesOrder !== undefined) {
    data.seriesOrder = relationships.seriesOrder;
  } else {
    delete data.seriesOrder;
  }

  if (relationships.relatedGuides.length > 0) {
    data.relatedGuides = relationships.relatedGuides;
  } else {
    delete data.relatedGuides;
  }

  const temporaryPath = `${guidePath}.tmp-${process.pid}-${Date.now()}`;
  const updatedSource = matter.stringify(parsed.content, data);

  await fs.writeFile(temporaryPath, updatedSource, "utf8");
  await fs.rename(temporaryPath, guidePath);

  return res.status(200).json({
    message: "Guide relationships updated successfully.",
    slug,
    url: `/guides/${slug}`,
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GuideResponse>,
) {
  if (req.method !== "POST" && req.method !== "PATCH") {
    res.setHeader("Allow", "POST, PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(
    req,
    res,
    authOptions as NextAuthOptions,
  );

  if ((session?.user as { role?: string } | undefined)?.role !== "admin") {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    const input = req.body as GuideInput;

    return req.method === "PATCH"
      ? await updateGuideRelationships(input, res)
      : await createGuide(input, res);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === "EEXIST") {
      return res.status(409).json({ error: "A guide with that slug already exists" });
    }

    console.error("Guide content operation failed", error);

    return res.status(400).json({
      error: error instanceof Error ? error.message : "The guide could not be saved.",
    });
  }
}
