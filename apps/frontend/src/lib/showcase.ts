// Base URL for showcase media: Cloudflare R2 CDN for zero egress bandwidth,
// or falls back to local /showcase if specified.
const R2_SHOWCASE_BASE = "https://pub-2e8083da687e4fe0af8225bbbdb43c1f.r2.dev/showcase";

export function getShowcaseUrl(path: string): string {
    if (!path) return "";
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    const clean = path.replace(/^\/?showcase\/?/, "");
    const base = (import.meta.env.VITE_SHOWCASE_BASE_URL as string | undefined) || R2_SHOWCASE_BASE;
    return `${base.replace(/\/$/, "")}/${clean}`;
}
