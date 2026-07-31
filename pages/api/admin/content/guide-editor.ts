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

interface UpdateBody {
  slug?: unknown;
  title?: unknown;
  description?: unknown;
  date?: unknown;
  order?: unknown;
  eventTypes?: unknown;
  tags?: unknown;
  series?: unknown;
  seriesOrder?: unknown;
  relatedGuides?: unknown;
  body?: unknown;
  coverImage?: unknown;
  coverImageAlt?: unknown;
}

interface EditableGuide {
  slug: string;
  title: string;
  description: string;
  date: string;
  order: number | null;
  eventTypes: string[];
  tags: string[];
  series: string;
  seriesOrder: number | null;
  relatedGuides: string[];
  body: string;
  coverImage: string;
  coverImageAlt: string;
}

type GuideEditorResponse =
  | { message?: string; guide: EditableGuide }
  | { error: string };

function validSlug(value: unknown, field = "Guide slug"): string {
  if (typeof value !== "string") {
    throw new Error(`${field} is required.`);
  }

  const slug = value.trim().toLowerCase();

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`${field} is invalid.`);
  }

  return slug;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }

  return value.trim();
}

function optionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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
    throw new Error(`${field} must be a whole number of ${minimum} or more.`);
  }

  return number;
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

function validateDate(value: unknown): string {
  const date = optionalString(value);

  if (!date) {
    return "";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Date must use YYYY-MM-DD format.");
  }

  return date;
}

function validateImageUrl(value: unknown): string {
  const image = optionalString(value);

  if (!image) {
    return "";
  }

  if (image.startsWith("/uploads/guides/")) {
    return image;
  }

  let parsed: URL;

  try {
    parsed = new URL(image);
  } catch {
    throw new Error("Cover image must be a valid local or web URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Cover image must use HTTP or HTTPS.");
  }

  return parsed.toString();
}

function responseForGuide(slug: string): EditableGuide | null {
  const guide = getGuideBySlug(slug);

  if (!guide) {
    return null;
  }

  return {
    slug: guide.slug,
    title: guide.title,
    description: guide.description,
    date: guide.date?.slice(0, 10) ?? "",
    order: guide.order ?? null,
    eventTypes: guide.eventTypes ?? [],
    tags: guide.tags ?? [],
    series: guide.series ?? "",
    seriesOrder: guide.seriesOrder ?? null,
    relatedGuides: guide.relatedGuides ?? [],
    body: guide.content,
    coverImage: guide.coverImage ?? "",
    coverImageAlt: guide.coverImageAlt ?? "",
  };
}

function setArrayField(
  data: Record<string, unknown>,
  field: string,
  values: string[],
) {
  if (values.length > 0) {
    data[field] = values;
  } else {
    delete data[field];
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GuideEditorResponse>,
) {
  if (req.method !== "GET" && req.method !== "PATCH") {
    res.setHeader("Allow", "GET, PATCH");
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
    const input = (req.body ?? {}) as UpdateBody;
    const slug = validSlug(req.method === "GET" ? req.query.slug : input.slug);
    const existing = responseForGuide(slug);

    if (!existing) {
      return res.status(404).json({ error: "Guide not found" });
    }

    if (req.method === "GET") {
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json({ guide: existing });
    }

    const title = requiredString(input.title, "Title");
    const description = optionalString(input.description);
    const date = validateDate(input.date);
    const order = optionalWholeNumber(input.order, "Order", 0);
    const body = requiredString(input.body, "Guide body");
    const eventTypes = stringArray(input.eventTypes);
    const tags = stringArray(input.tags);
    const series = optionalString(input.series).toLowerCase();
    const seriesOrder = optionalWholeNumber(
      input.seriesOrder,
      "Series position",
      1,
    );

    if (series && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(series)) {
      throw new Error("Series may only contain lowercase letters, numbers and hyphens.");
    }

    if (seriesOrder !== undefined && !series) {
      throw new Error("Choose a series before setting a series position.");
    }

    const availableGuideSlugs = new Set(
      getAllGuides().map((guide) => guide.slug),
    );
    const relatedGuides = stringArray(input.relatedGuides)
      .filter((relatedSlug) => relatedSlug !== slug)
      .map((relatedSlug) => {
        validSlug(relatedSlug, "Related guide slug");

        if (!availableGuideSlugs.has(relatedSlug)) {
          throw new Error(`Related guide does not exist: ${relatedSlug}`);
        }

        return relatedSlug;
      });
    const coverImage = validateImageUrl(input.coverImage);
    const coverImageAlt = optionalString(input.coverImageAlt);

    if (coverImage && !coverImageAlt) {
      throw new Error("Cover image alternative text is required.");
    }

    const guidePath = path.join(getGuidesDirectory(), `${slug}.md`);
    const source = await fs.readFile(guidePath, "utf8");
    const parsed = matter(source);
    const data: Record<string, unknown> = { ...parsed.data };

    data.title = title;
    data.description = description;

    if (date) data.date = date;
    else delete data.date;

    if (order !== undefined) data.order = order;
    else delete data.order;

    setArrayField(data, "eventTypes", eventTypes);
    setArrayField(data, "tags", tags);
    setArrayField(data, "relatedGuides", relatedGuides);

    if (series) data.series = series;
    else delete data.series;

    if (seriesOrder !== undefined) data.seriesOrder = seriesOrder;
    else delete data.seriesOrder;

    if (coverImage) {
      data.coverImage = coverImage;
      data.coverImageAlt = coverImageAlt;
    } else {
      delete data.coverImage;
      delete data.coverImageAlt;
    }

    const temporaryPath = `${guidePath}.tmp-${process.pid}-${Date.now()}`;
    const updatedSource = matter.stringify(`${body}\n`, data);

    await fs.writeFile(temporaryPath, updatedSource, "utf8");
    await fs.rename(temporaryPath, guidePath);

    return res.status(200).json({
      message: "Published guide updated successfully.",
      guide: responseForGuide(slug)!,
    });
  } catch (error) {
    console.error("Published guide editor operation failed", error);
    return res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "The published guide could not be updated.",
    });
  }
}
