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

  const { id } = req.query;
  const searchStringId = parseInt(id, 10);

  if (Number.isNaN(searchStringId)) {
    return res.status(400).json({ error: "Invalid search id." });
  }

  const existing = await prisma.searchString.findUnique({
    where: { id: searchStringId },
    include: { owner: { select: { id: true, ign: true } } },
  });

  if (!existing) {
    return res.status(404).json({ error: "Saved search not found." });
  }

  const isAdmin = session.user.role === "admin";
  const isOwner = existing.ownerId === session.user.id;

  if (!isAdmin && !isOwner) {
    return res.status(403).json({ error: "Access denied." });
  }

  if (req.method === "PATCH") {
    const { title, query } = req.body;

    if (!title?.trim() || !query?.trim()) {
      return res.status(400).json({ error: "Title and search string are required." });
    }

    try {
      const updated = await prisma.searchString.update({
        where: { id: searchStringId },
        data: { title: title.trim(), query: query.trim() },
        include: { owner: { select: { id: true, ign: true } } },
      });

      return res.status(200).json(serializeSearchString(updated));
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to update search." });
    }
  }

  if (req.method === "DELETE") {
    try {
      await prisma.searchString.delete({ where: { id: searchStringId } });
      return res.status(200).json({ message: "Deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to delete search." });
    }
  }

  return res.status(405).json({ error: "Method not allowed." });
}
