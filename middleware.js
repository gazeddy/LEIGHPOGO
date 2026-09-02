import { NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"
import {
  PRIVACY_POLICY_VERSION,
  hasCurrentPrivacyAcceptance,
} from "./lib/privacyPolicy"

const publicPaths = [
  "/",
  "/events",
  "/friend-codes",
  "/login",
  "/register",
  "/privacy",
  "/privacy/accept",
  "/robots.txt",
  "/sitemap.xml",
  "/favicon.ico",
]

function isPublicPath(pathname) {
  return (
    publicPaths.includes(pathname) ||
    pathname.startsWith("/events/") ||
    pathname.startsWith("/friend-codes/") ||
    pathname.startsWith("/login/") ||
    pathname.startsWith("/register/") ||
    pathname.startsWith("/privacy/") ||
    pathname.startsWith("/generated/events/") ||
    pathname.startsWith("/_next/")
  )
}

function legacyEventRedirect(req) {
  if (req.nextUrl.pathname !== "/events") return null

  const eventID = req.nextUrl.searchParams.get("event")?.trim()
  if (!eventID) return null

  const destination = req.nextUrl.clone()
  destination.pathname = `/events/${encodeURIComponent(eventID)}`
  destination.searchParams.delete("event")

  return NextResponse.redirect(destination, 308)
}

function isPrivacyExemptApi(pathname) {
  return pathname.startsWith("/api/auth/") || pathname === "/api/privacy/accept"
}

function privacyRedirect(req) {
  const acceptUrl = req.nextUrl.clone()
  acceptUrl.pathname = "/privacy/accept"
  acceptUrl.search = ""

  const callbackUrl = req.nextUrl.pathname + req.nextUrl.search
  if (callbackUrl !== "/privacy/accept") {
    acceptUrl.searchParams.set("callbackUrl", callbackUrl)
  }

  return NextResponse.redirect(acceptUrl)
}

export async function middleware(req) {
  const { pathname } = req.nextUrl
  const isApiRequest = pathname.startsWith("/api/")
  const eventRedirect = legacyEventRedirect(req)

  if (eventRedirect) {
    return eventRedirect
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  })

  // Every authenticated V4 session must carry acknowledgement of the current
  // policy version. Tokens issued before V4 have no version and are gated too.
  if (
    token?.id &&
    !hasCurrentPrivacyAcceptance(token.privacyPolicyVersion) &&
    pathname !== "/privacy" &&
    pathname !== "/privacy/accept" &&
    !isPrivacyExemptApi(pathname)
  ) {
    if (isApiRequest) {
      return NextResponse.json(
        {
          error: "Privacy Policy acknowledgement required.",
          policyVersion: PRIVACY_POLICY_VERSION,
        },
        { status: 428 },
      )
    }

    return privacyRedirect(req)
  }

  // API handlers retain their existing authentication rules. Middleware only
  // adds the privacy-version gate for already-authenticated API requests.
  if (isApiRequest || isPrivacyExemptApi(pathname)) {
    return NextResponse.next()
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  if (!token?.id) {
    const signInUrl = req.nextUrl.clone()
    signInUrl.pathname = "/login"
    signInUrl.searchParams.set(
      "callbackUrl",
      req.nextUrl.pathname + req.nextUrl.search,
    )
    return NextResponse.redirect(signInUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|_next/data|favicon.ico).*)"],
}
