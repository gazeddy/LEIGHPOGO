import { getSession } from "next-auth/react";
import prisma from "../../../../lib/prisma";

export default async function handler(req, res) {
  const session = await getSession({ req });
  if (!session || session.user.role !== "admin") {
    return res.status(403).json({ message: "Access denied" });
  }

  const { id } = req.query;

  if (req.method === "DELETE") {
    await prisma.entry.delete({ where: { id: Number(id) } });
    return res.status(204).end();
  }

  if (req.method === "PUT") {
    const { trainerName, friendCode } = req.body;

    if (!trainerName || !friendCode) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const updated = await prisma.entry.update({
      where: { id: Number(id) },
      data: { trainerName, code: friendCode },
    });
    return res.json(updated);
  }

  res.status(405).json({ message: "Method not allowed" });
}
