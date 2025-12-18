import bcrypt from "bcryptjs"
import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { ensureNextAuthUrl, getNextAuthSecret } from "../../../lib/env"
import prisma from "../../../lib/prisma"

// Ensure critical env defaults exist so production builds can boot even when
// NEXTAUTH_URL or NEXTAUTH_SECRET are not explicitly set.
ensureNextAuthUrl()
const nextAuthSecret = getNextAuthSecret()

export const authOptions = {
  session: { strategy: "jwt" },
  secret: nextAuthSecret,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        ign: { label: "In-Game Name", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials) {
          return null
        }

        const user = await prisma.user.findUnique({
          where: { ign: credentials.ign },
        })
        if (!user) return null

        const isValid = await bcrypt.compare(credentials.password, user.password)
        if (!isValid) return null

        return { id: user.id, ign: user.ign, role: user.role }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.ign = user.ign
        token.role = user.role
      }
      return token
    },
    async session({ session, token }) {
      if (!token?.id) {
        return session ?? null
      }

      const baseSession = session ?? {}

      return {
        ...baseSession,
        user: {
          ...(baseSession.user ?? {}),
          id: token.id,
          ign: token.ign,
          role: token.role,
        },
      }
    },
    async redirect({ baseUrl }) {
      return baseUrl
    },
  },
  pages: {
    signIn: "/login", // your custom login page
  },
};

export default NextAuth(authOptions);
