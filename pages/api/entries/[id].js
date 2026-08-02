import { getSession } from "next-auth/react";
import prisma from "../../../lib/prisma";
import { canonicalFriendCode } from "../../../lib/friendCode";

export default async function handler(req, res) {
  const session = await getSession({ req });

  if (!session) {
    return res.status(403).json({ error: "Access denied" });
  }

  const entryId = parseInt(req.query.id);

  const existingEntry = await prisma.entry.findUnique({
    where: { id: entryId },
  });

  if (!existingEntry) {
    return res.status(404).json({ error: "Entry not found" });
  }

  const isOwner = existingEntry.ownerId === session.user.id;
  const isAdmin = session.user.role === "admin";

  if (req.method === "PATCH") {
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { trainerName, friendCode } = req.body;
    const normalizedTrainerName = String(trainerName || "").trim();
    const normalizedFriendCode = canonicalFriendCode(friendCode);

    if (!normalizedTrainerName || !friendCode) {
      return res.status(400).json({ error: "Missing fields" });
    }

    if (!normalizedFriendCode) {
      return res.status(400).json({
        error: "Friend code must contain exactly 12 digits.",
      });
    }

    try {
      const updatedEntry = await prisma.entry.update({
        where: { id: entryId },
        data: {
          trainerName: normalizedTrainerName,
          code: normalizedFriendCode,
        },
      });
      res.status(200).json(updatedEntry);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update entry" });
    }

  } else if (req.method === "DELETE") {
    if (!isAdmin) {
      return res.status(403).json({ error: "Access denied" });
    }

    try {
      await prisma.entry.delete({ where: { id: entryId } });
      res.status(200).json({ message: "Entry deleted" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to delete entry" });
    }

  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
