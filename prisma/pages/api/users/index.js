import prisma from '../../../lib/prisma'

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { ign, password } = req.body
    try {
      const newUser = await prisma.user.create({
        data: { ign, password }
      })
      res.status(201).json(newUser)
    } catch (err) {
      res.status(400).json({ error: 'Username already exists' })
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' })
  }
}
