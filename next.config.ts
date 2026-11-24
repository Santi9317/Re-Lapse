import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

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

function shippingRelease(): { version: string; sha: string; at: string } {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version?: string };
  const version = typeof pkg.version === "string" ? pkg.version : "";
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA || git(["rev-parse", "HEAD"])).trim();
  const at = (process.env.RELEASE_COMMITTED_AT || git(["log", "-1", "--format=%cI"])).trim();
  if (!version || !sha || Number.isNaN(Date.parse(at))) {
    throw new Error("Re-Lapse could not read the shipping commit date.");
  }
  return { version, sha, at };
}

const release = shippingRelease();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  env: {
    NEXT_PUBLIC_RELEASE_VERSION: release.version,
    NEXT_PUBLIC_RELEASE_SHA: release.sha,
    NEXT_PUBLIC_RELEASE_AT: release.at,
  },
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  async headers() {
    return [
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
