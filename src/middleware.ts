import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { boothFromCookie, cameraAuthFromCookie, shouldRefreshPhoneCookie } from "@/server/camera-auth";

function contentSecurityPolicy(nonce: string): string {
  const dev = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
}

export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const policy = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  if (shouldRefreshPhoneCookie(request.method, request.nextUrl.pathname)) {
    const header = request.headers.get("cookie");
    const auth = cameraAuthFromCookie(header);
    const secure = request.nextUrl.protocol === "https:";
    if (auth) {
      response.cookies.set("relapse_auth", `${auth.token}.${auth.proof}`, {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 31_536_000,
      });
    }
    const booth = boothFromCookie(header);
    if (booth) {
      response.cookies.set("relapse_booth", booth, {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 31_536_000,
      });
    }
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
