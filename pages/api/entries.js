import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import prisma from "../../lib/prisma"; // adjust path if needed

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ error: "You must be logged in." });
  }

  if (req.method === "POST") {
    try {
      const { trainerName, friendCode } = req.body;

      if (!trainerName || !friendCode) {
        return res.status(400).json({ error: "All fields are required." });
      }

      const entry = await prisma.entry.create({
        data: {
          trainerName,
          code: friendCode,
          ownerId: session.user.id,
        },
        include: {
          owner: { select: { id: true, ign: true, role: true } },
        },
      });

      return res.status(201).json(entry);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to create entry." });
    }
  }

  if (req.method === "GET") {
    try {
      const entries = await prisma.entry.findMany({
        include: { owner: { select: { id: true, ign: true } } },
        orderBy: { createdAt: "desc" },
      });
      return res.status(200).json(entries);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to fetch entries." });
    }
  }

  return res.status(405).json({ error: "Method not allowed." });
}
