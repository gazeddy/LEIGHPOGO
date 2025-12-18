import { getServerSession } from "next-auth";
import prisma from "../../../../lib/prisma";
import { authOptions } from "../../auth/[...nextauth]";

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session || session.user.role !== "admin") {
    return res.status(403).json({ message: "Access denied" });
  }

  const { id } = req.query;

  if (req.method === "DELETE") {
    await prisma.entry.delete({ where: { id: Number(id) } });
    return res.status(204).end();
  }

  if (req.method === "PUT") {
    const { trainerName, friendCode, team } = req.body;
    const updates = {};
    const validTeams = ["INSTINCT", "MYSTIC", "VALOR"];

    if (trainerName !== undefined) {
      if (!trainerName) {
        return res.status(400).json({ message: "Trainer name is required" });
      }
      updates.trainerName = trainerName;
    }

    if (friendCode !== undefined) {
      if (!friendCode) {
        return res.status(400).json({ message: "Friend code is required" });
      }
      updates.code = friendCode;
    }

    if (team !== undefined) {
      const normalizedTeam = String(team).toUpperCase();

      if (!validTeams.includes(normalizedTeam)) {
        return res.status(400).json({ message: "Invalid team selection" });
      }

      updates.team = normalizedTeam;
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ message: "No fields provided" });
    }

    const updated = await prisma.entry.update({
      where: { id: Number(id) },
      data: updates,
    });
    return res.json(updated);
  }

  res.status(405).json({ message: "Method not allowed" });
}
