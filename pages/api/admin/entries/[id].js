import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import prisma from "../../../../lib/prisma";
import { canonicalFriendCode } from "../../../../lib/friendCode";

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);

  if (!session || session.user?.role !== "admin") {
    return res.status(403).json({ message: "Access denied" });
  }

  const entryId = Number(req.query.id);

  if (!Number.isInteger(entryId) || entryId <= 0) {
    return res.status(400).json({ message: "Invalid entry ID." });
  }

  if (req.method === "DELETE") {
    try {
      await prisma.entry.delete({ where: { id: entryId } });
      return res.status(204).end();
    } catch (error) {
      console.error("Failed to delete friend-code entry", error);
      return res.status(500).json({ message: "Failed to delete entry" });
    }
  }

  if (req.method === "PUT") {
    const { trainerName, friendCode } = req.body;
    const normalizedTrainerName = String(trainerName || "").trim();
    const normalizedFriendCode = canonicalFriendCode(friendCode);

    if (!normalizedTrainerName || !String(friendCode ?? "").trim()) {
      return res.status(400).json({
        message: "Trainer name and friend code are required.",
      });
    }

    if (!normalizedFriendCode) {
      return res.status(400).json({
        message: "Friend code must contain exactly 12 digits.",
      });
    }

    try {
      const updated = await prisma.entry.update({
        where: { id: entryId },
        data: {
          trainerName: normalizedTrainerName,
          code: normalizedFriendCode,
        },
      });
      return res.status(200).json(updated);
    } catch (error) {
      console.error("Failed to update friend-code entry", error);
      return res.status(500).json({ message: "Failed to update entry" });
    }
  }

  res.setHeader("Allow", ["PUT", "DELETE"]);
  return res.status(405).json({ message: "Method not allowed" });
}
