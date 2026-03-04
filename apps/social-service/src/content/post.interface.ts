// ── Add to your existing post interfaces / create post.interfaces.ts ─────────

export interface PostStats {
  // ── Counts ──────────────────────────────────────────────────────────────
  total: number;
  approved: number;
  pending: number;
  rejected: number;

  // ── Percentages (0–100, 2 decimal places) ───────────────────────────────
  approvedPercent: number;
  pendingPercent: number;
  rejectedPercent: number;

  // ── Engagement totals (summed across all author's posts) ─────────────────
  totalLikes: number;

  // ── Author-scoped metrics (only meaningful for DOCTOR / HOSPITAL / CENTER)
  // Number of posts belonging to the requesting author
  myPostsCount: number;
  myLikesReceived: number; // total likes across author's own posts
}
