import { getServerSession } from "next-auth";
import prisma from "../../../lib/prisma";
import { authOptions } from "../auth/[...nextauth]";

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(403).json({ error: "Access denied" });
  }

  const entryId = parseInt(req.query.id);
  const userId = Number(session.user.id);

  const existingEntry = await prisma.entry.findUnique({
    where: { id: entryId },
  });

  if (!existingEntry) {
    return res.status(404).json({ error: "Entry not found" });
  }

  const isOwner = !Number.isNaN(userId) && existingEntry.ownerId === userId;
  const isAdmin = session.user.role === "admin";

  if (req.method === "PATCH") {
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { trainerName, friendCode, team } = req.body;
    const updates = {};

    if (trainerName !== undefined) {
      if (!trainerName) {
        return res.status(400).json({ error: "Trainer name is required" });
      }
      updates.trainerName = trainerName;
    }

    if (friendCode !== undefined) {
      if (!friendCode) {
        return res.status(400).json({ error: "Friend code is required" });
      }
      updates.code = friendCode;
    }

    if (team !== undefined) {
      const normalizedTeam = String(team).toUpperCase();
      const validTeams = ["INSTINCT", "MYSTIC", "VALOR"];

      if (!validTeams.includes(normalizedTeam)) {
        return res.status(400).json({ error: "Invalid team selection" });
      }

      updates.team = normalizedTeam;
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: "No fields provided for update" });
    }

    try {
      const updatedEntry = await prisma.entry.update({
        where: { id: entryId },
        data: updates,
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
