import fs from "node:fs/promises";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import { getGuideBySlug, getGuidesDirectory } from "../../../../lib/guides";
import { authOptions } from "../../auth/[...nextauth]";

interface GuideInput {
  title?: unknown;
  slug?: unknown;
  description?: unknown;
  date?: unknown;
  order?: unknown;
  eventTypes?: unknown;
  tags?: unknown;
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
  body: string;
}): string {
  const frontMatter = [
    "---",
    `title: ${yamlString(input.title)}`,
    `description: ${yamlString(input.description)}`,
    `date: ${yamlString(input.date)}`,
  ];

  if (input.order !== undefined) {
    frontMatter.push(`order: ${input.order}`);
  }

  frontMatter.push(...renderArray("eventTypes", input.eventTypes));
  frontMatter.push(...renderArray("tags", input.tags));
  frontMatter.push("---", "", input.body.trim(), "");

  return frontMatter.join("\n");
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GuideResponse>,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
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

    const rawOrder = input.order;
    const order =
      rawOrder === "" || rawOrder === undefined || rawOrder === null
        ? undefined
        : Number(rawOrder);

    if (order !== undefined && (!Number.isInteger(order) || order < 0)) {
      throw new Error("Order must be a positive whole number");
    }

    const date = optionalString(input.date) || new Date().toISOString().slice(0, 10);
    const guideSource = renderGuide({
      title,
      description,
      date,
      order,
      eventTypes: stringArray(input.eventTypes),
      tags: stringArray(input.tags),
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
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === "EEXIST") {
      return res.status(409).json({ error: "A guide with that slug already exists" });
    }

    console.error("Guide creation failed", error);

    return res.status(400).json({
      error: error instanceof Error ? error.message : "The guide could not be created.",
    });
  }
}
