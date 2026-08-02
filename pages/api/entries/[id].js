import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import prisma from "../../../lib/prisma";
import { canonicalFriendCode } from "../../../lib/friendCode";

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ error: "You must be logged in." });
  }

  const entryId = Number(req.query.id);
  const currentUserId = Number(session.user?.id);

  if (!Number.isInteger(entryId) || entryId <= 0) {
    return res.status(400).json({ error: "Invalid entry ID." });
  }

  if (!Number.isInteger(currentUserId)) {
    return res.status(401).json({ error: "Your account could not be identified." });
  }

  const existingEntry = await prisma.entry.findUnique({
    where: { id: entryId },
  });

  if (!existingEntry) {
    return res.status(404).json({ error: "Entry not found" });
  }

  const isOwner = existingEntry.ownerId === currentUserId;
  const isAdmin = session.user.role === "admin";

  if (req.method === "PATCH") {
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { trainerName, friendCode } = req.body;
    const normalizedTrainerName = String(trainerName || "").trim();
    const normalizedFriendCode = canonicalFriendCode(friendCode);

    if (!normalizedTrainerName || !String(friendCode ?? "").trim()) {
      return res.status(400).json({ error: "Trainer name and friend code are required." });
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
      return res.status(200).json(updatedEntry);
    } catch (err) {
      console.error("Failed to update friend-code entry", err);
      return res.status(500).json({ error: "Failed to update entry" });
    }
  }

  if (req.method === "DELETE") {
    if (!isAdmin) {
      return res.status(403).json({ error: "Access denied" });
    }

    try {
      await prisma.entry.delete({ where: { id: entryId } });
      return res.status(200).json({ message: "Entry deleted" });
    } catch (err) {
      console.error("Failed to delete friend-code entry", err);
      return res.status(500).json({ error: "Failed to delete entry" });
    }
  }

  res.setHeader("Allow", ["PATCH", "DELETE"]);
  return res.status(405).json({ error: "Method not allowed" });
}
