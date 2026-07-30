import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const UPLOAD_DIRECTORY =
  process.env.GUIDE_UPLOADS_DIRECTORY?.trim() ||
  path.join(process.cwd(), "public", "uploads", "guides");
const URL_PREFIX =
  process.env.GUIDE_UPLOADS_URL_PREFIX?.trim().replace(/\/$/, "") ||
  "/uploads/guides";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

interface UploadBody {
  fileName?: unknown;
  mimeType?: unknown;
  dataUrl?: unknown;
}

type UploadResponse =
  | { message: string; url: string; fileName: string; size: number }
  | { error: string };

function cleanBaseName(fileName: string): string {
  return path
    .basename(fileName, path.extname(fileName))
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "guide-image";
}

function hasValidSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (mimeType === "image/png") {
    return (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }

  if (mimeType === "image/webp") {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }

  return false;
}

function decodeImage(body: UploadBody): {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
} {
  if (typeof body.fileName !== "string" || !body.fileName.trim()) {
    throw new Error("File name is required.");
  }

  if (typeof body.mimeType !== "string" || !EXTENSION_BY_MIME[body.mimeType]) {
    throw new Error("Only JPEG, PNG and WebP images are supported.");
  }

  if (typeof body.dataUrl !== "string") {
    throw new Error("Image data is required.");
  }

  const match = body.dataUrl.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);

  if (!match || match[1] !== body.mimeType) {
    throw new Error("The uploaded image data is invalid.");
  }

  const buffer = Buffer.from(match[2], "base64");

  if (buffer.length === 0 || buffer.length > MAX_IMAGE_SIZE) {
    throw new Error("Images must be between 1 byte and 5 MB.");
  }

  if (!hasValidSignature(buffer, body.mimeType)) {
    throw new Error("The file contents do not match the selected image type.");
  }

  return {
    fileName: body.fileName.trim(),
    mimeType: body.mimeType,
    buffer,
  };
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UploadResponse>,
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
    const image = decodeImage(req.body as UploadBody);
    const extension = EXTENSION_BY_MIME[image.mimeType];
    const storedFileName = `${cleanBaseName(image.fileName)}-${crypto.randomUUID()}${extension}`;
    const destination = path.join(UPLOAD_DIRECTORY, storedFileName);

    await fs.mkdir(UPLOAD_DIRECTORY, { recursive: true });
    await fs.writeFile(destination, image.buffer, { flag: "wx" });

    return res.status(201).json({
      message: "Guide image uploaded successfully.",
      url: `${URL_PREFIX}/${storedFileName}`,
      fileName: storedFileName,
      size: image.buffer.length,
    });
  } catch (error) {
    console.error("Guide image upload failed", error);
    return res.status(400).json({
      error: error instanceof Error ? error.message : "The image could not be uploaded.",
    });
  }
}
