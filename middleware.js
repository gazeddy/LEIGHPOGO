import { NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"

const publicPaths = [
  "/",           // ✅ MUST be public
  "/events",
  "/login",
  "/register",
  "/favicon.ico",
]

function isPublicPath(pathname) {
  return (
    publicPaths.includes(pathname) ||
    pathname.startsWith("/events/") ||
    pathname.startsWith("/login/") ||
    pathname.startsWith("/register/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/auth")
  )
}

export async function middleware(req) {
  const { pathname } = req.nextUrl

  // ✅ Allow public routes
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // 🔐 Check session
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  })

  // 🚪 Not logged in → redirect once
  if (!token) {
    const signInUrl = req.nextUrl.clone()
    signInUrl.pathname = "/login"
    signInUrl.searchParams.set(
      "callbackUrl",
      req.nextUrl.pathname + req.nextUrl.search
    )
    return NextResponse.redirect(signInUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|_next/data|favicon.ico).*)"],
}
