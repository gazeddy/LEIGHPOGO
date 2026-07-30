import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { NextApiRequest, NextApiResponse } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import { getGuideBySlug, getGuidesDirectory } from "../../../../lib/guides";
import { authOptions } from "../../auth/[...nextauth]";

interface UpdateBody {
  slug?: unknown;
  body?: unknown;
  coverImage?: unknown;
  coverImageAlt?: unknown;
}

type GuideEditorResponse =
  | {
      message?: string;
      guide: {
        slug: string;
        title: string;
        body: string;
        coverImage: string;
        coverImageAlt: string;
      };
    }
  | { error: string };

function validSlug(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Guide slug is required.");
  }

  const slug = value.trim().toLowerCase();

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Guide slug is invalid.");
  }

  return slug;
}

function optionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error("Cover image must use HTTP or HTTPS.");
  }

  return parsed.toString();
}

function responseForGuide(slug: string) {
  const guide = getGuideBySlug(slug);

  if (!guide) {
    return null;
  }

  return {
    slug: guide.slug,
    title: guide.title,
    body: guide.content,
    coverImage: guide.coverImage ?? "",
    coverImageAlt: guide.coverImageAlt ?? "",
  };
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
    const slug = validSlug(req.method === "GET" ? req.query.slug : (req.body as UpdateBody).slug);
    const existing = responseForGuide(slug);

    if (!existing) {
      return res.status(404).json({ error: "Guide not found" });
    }

    if (req.method === "GET") {
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json({ guide: existing });
    }

    const body = (req.body as UpdateBody).body;

    if (typeof body !== "string" || !body.trim()) {
      throw new Error("Guide body is required.");
    }

    const coverImage = validateImageUrl((req.body as UpdateBody).coverImage);
    const coverImageAlt = optionalString((req.body as UpdateBody).coverImageAlt);

    if (coverImage && !coverImageAlt) {
      throw new Error("Cover image alternative text is required.");
    }

    const guidePath = path.join(getGuidesDirectory(), `${slug}.md`);
    const source = await fs.readFile(guidePath, "utf8");
    const parsed = matter(source);
    const data = { ...parsed.data };

    if (coverImage) {
      data.coverImage = coverImage;
      data.coverImageAlt = coverImageAlt;
    } else {
      delete data.coverImage;
      delete data.coverImageAlt;
    }

    const temporaryPath = `${guidePath}.tmp-${process.pid}-${Date.now()}`;
    const updatedSource = matter.stringify(`${body.trim()}\n`, data);

    await fs.writeFile(temporaryPath, updatedSource, "utf8");
    await fs.rename(temporaryPath, guidePath);

    return res.status(200).json({
      message: "Guide pictures and content updated successfully.",
      guide: responseForGuide(slug)!,
    });
  } catch (error) {
    console.error("Guide image editor operation failed", error);
    return res.status(400).json({
      error: error instanceof Error ? error.message : "The guide could not be updated.",
    });
  }
}
