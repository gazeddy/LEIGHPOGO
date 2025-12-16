import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import prisma from "../../../lib/prisma";

function serializeSearchString(entry) {
  return {
    ...entry,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ error: "You must be logged in." });
  }

  const isAdmin = session.user.role === "admin";

  if (req.method === "GET") {
    try {
      const searchStrings = await prisma.searchString.findMany({
        where: isAdmin ? {} : { ownerId: session.user.id },
        include: { owner: { select: { id: true, ign: true } } },
        orderBy: { updatedAt: "desc" },
      });

      return res.status(200).json(searchStrings.map(serializeSearchString));
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to load saved searches." });
    }
  }

  if (req.method === "POST") {
    const { title, query } = req.body;

    if (!title?.trim() || !query?.trim()) {
      return res.status(400).json({ error: "Title and search string are required." });
    }

    try {
      const created = await prisma.searchString.create({
        data: {
          title: title.trim(),
          query: query.trim(),
          ownerId: session.user.id,
        },
        include: { owner: { select: { id: true, ign: true } } },
      });

      return res.status(201).json(serializeSearchString(created));
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to save search." });
    }
  }

  return res.status(405).json({ error: "Method not allowed." });
}
