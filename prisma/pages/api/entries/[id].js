import { getSession } from "next-auth/react";
import prisma from "../../../lib/prisma";

export default async function handler(req, res) {
  const session = await getSession({ req });

  if (!session || session.user.role !== "admin") {
    return res.status(403).json({ error: "Access denied" });
  }

  const entryId = parseInt(req.query.id);

  if (req.method === "PATCH") {
    const { trainerName, friendCode } = req.body;

    if (!trainerName || !friendCode) {
      return res.status(400).json({ error: "Missing fields" });
    }

    try {
      const updatedEntry = await prisma.entry.update({
        where: { id: entryId },
        data: { trainerName, friendCode },
      });
      res.status(200).json(updatedEntry);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update entry" });
    }

  } else if (req.method === "DELETE") {
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
