import { withAuth } from "next-auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import type { JWT } from "next-auth/jwt";

export const middleware = withAuth(
  function middleware(req: NextRequest & { nextauth?: { token: JWT | null } }) {
    const token = req.nextauth?.token;

    // Check if user has at least one company membership
    if (!token || !token.sub) {
      return NextResponse.redirect(new URL("/auth/login", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: "/auth/login",
    },
  }
);

// Protect routes
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/sales/:path*",
    "/supply-chain/:path*",
    "/operational/:path*",
    "/finance/:path*",
    "/hr/:path*",
    "/reports/:path*",
    "/settings/:path*",
  ],
};
