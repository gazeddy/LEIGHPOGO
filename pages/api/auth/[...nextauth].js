import bcrypt from "bcryptjs"
import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { ensureNextAuthUrl, getNextAuthSecret } from "../../../lib/env"
import prisma from "../../../lib/prisma"
import {
  PRIVACY_POLICY_VERSION,
  hasCurrentPrivacyAcceptance,
} from "../../../lib/privacyPolicy"

ensureNextAuthUrl()
const nextAuthSecret = getNextAuthSecret()

async function refreshTokenAccountState(token) {
  const userId = Number(token?.id)
  if (!Number.isInteger(userId)) return token

  const revoked = await prisma.accountRevocation.findUnique({
    where: { userId },
    select: { userId: true },
  })

  if (revoked) {
    return {
      ...token,
      id: null,
      accountRevoked: true,
      privacyPolicyVersion: null,
    }
  }

  const activeUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      ign: true,
      role: true,
      privacyAcceptances: {
        where: { policyVersion: PRIVACY_POLICY_VERSION },
        select: { policyVersion: true },
        take: 1,
      },
    },
  })

  if (!activeUser) {
    return {
      ...token,
      id: null,
      accountRevoked: true,
      privacyPolicyVersion: null,
    }
  }

  return {
    ...token,
    id: activeUser.id,
    ign: activeUser.ign,
    role: activeUser.role,
    accountRevoked: false,
    privacyPolicyVersion: activeUser.privacyAcceptances[0]?.policyVersion || null,
  }
}

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
          select: {
            id: true,
            ign: true,
            role: true,
            password: true,
            privacyAcceptances: {
              where: { policyVersion: PRIVACY_POLICY_VERSION },
              select: { policyVersion: true },
              take: 1,
            },
          },
        })
        if (!user) return null

        const isValid = await bcrypt.compare(credentials.password, user.password)
        if (!isValid) return null

        return {
          id: user.id,
          ign: user.ign,
          role: user.role,
          privacyPolicyVersion: user.privacyAcceptances[0]?.policyVersion || null,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      let nextToken = token

      if (user) {
        nextToken = {
          ...token,
          id: user.id,
          ign: user.ign,
          role: user.role,
          accountRevoked: false,
          privacyPolicyVersion: user.privacyPolicyVersion || null,
        }
      }

      if (nextToken?.id) {
        nextToken = await refreshTokenAccountState(nextToken)
      }

      return nextToken
    },
    async session({ session, token }) {
      if (!token?.id || token.accountRevoked) {
        return null
      }

      const baseSession = session ?? {}

      return {
        ...baseSession,
        user: {
          ...(baseSession.user ?? {}),
          id: token.id,
          ign: token.ign,
          role: token.role,
          privacyPolicyVersion: token.privacyPolicyVersion || null,
          privacyPolicyAccepted: hasCurrentPrivacyAcceptance(token.privacyPolicyVersion),
        },
      }
    },
    async redirect({ baseUrl }) {
      return baseUrl
    },
  },
  pages: {
    signIn: "/login",
  },
}

export default NextAuth(authOptions)
