
import prisma from '../../../lib/prisma'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../auth/[...nextauth]'

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || session.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })

  const users = await prisma.user.findMany({ orderBy: { id: 'asc' }, select: { id: true, email: true, name: true, role: true } })
  return res.json(users)
}
