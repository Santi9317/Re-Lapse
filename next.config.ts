import { execFileSync } from "node:child_process";
import type { NextConfig } from "next";
import { APP_VERSION } from "./src/lib/release";

function git(args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function shippingRelease(): { version: string; sha: string; at: string } | null {
  const version = APP_VERSION;
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA || git(["rev-parse", "HEAD"])).trim();
  const at = (process.env.RELEASE_COMMITTED_AT || git(["log", "-1", "--format=%cI"])).trim();
  // A publish build may not have the git checkout. The You menu reads
  // APP_VERSION directly, so a missing git stamp must not fail the build.
  if (!version || !sha || Number.isNaN(Date.parse(at))) return null;
  return { version, sha, at };
}

const release = shippingRelease();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  env: release
    ? {
        NEXT_PUBLIC_RELEASE_VERSION: release.version,
        NEXT_PUBLIC_RELEASE_SHA: release.sha,
        NEXT_PUBLIC_RELEASE_AT: release.at,
      }
    : {},
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
