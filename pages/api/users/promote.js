
import prisma from '../../../lib/prisma'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../auth/[...nextauth]'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getServerSession(req, res, authOptions)
  if (!session || session.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })

  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: 'User ID required' })

  const updated = await prisma.user.update({ where: { id: Number(userId) }, data: { role: 'admin' } })
  return res.json({ success: true, user: { id: updated.id, email: updated.email, role: updated.role } })
}
