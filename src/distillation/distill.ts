import { db } from "../db/connection.js";
import { getAllSessions, getRecentSessions, getSessionCount } from "../db/sessions.js";
import { getAllMemories } from "../db/memory.js";
import { config } from "../config.js";
import type { ProjectProfile, SessionCapture } from "../types.js";

// ───── Profile CRUD ───────────────────────────────────────────────────────────

const stmtUpsertProfile = db.prepare(`
  INSERT INTO project_profiles
    (id, project_path, summary, decisions, patterns, current_state, session_count, last_distilled_at, created_at)
  VALUES
    (@id, @project_path, @summary, @decisions, @patterns, @current_state, @session_count, @last_distilled_at, @created_at)
  ON CONFLICT(project_path) DO UPDATE SET
    summary           = excluded.summary,
    decisions         = excluded.decisions,
    patterns          = excluded.patterns,
    current_state     = excluded.current_state,
    session_count     = excluded.session_count,
    last_distilled_at = excluded.last_distilled_at
`);

const stmtGetProfile = db.prepare(`
  SELECT * FROM project_profiles WHERE project_path = ?
`);

function parseProfileRow(row: any): ProjectProfile {
  return {
    ...row,
    decisions: JSON.parse(row.decisions),
    patterns: JSON.parse(row.patterns),
    current_state: row.current_state ?? "",
  };
}

export function getProjectProfile(projectPath: string): ProjectProfile | undefined {
  const row = stmtGetProfile.get(projectPath) as any;
  return row ? parseProfileRow(row) : undefined;
}

// ───── Deduplication ─────────────────────────────────────────────────────────

/** Normalize a string for fuzzy comparison: lowercase + collapse whitespace */
function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Deduplicate an array of strings by exact normalized match.
 * For near-identical entries, keeps the first occurrence.
 * Caps output to avoid bloating the profile.
 */
function deduplicateStrings(items: string[], cap: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = normalize(item);
    if (key.length < 3) continue;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
    if (result.length >= cap) break;
  }
  return result;
}

// ───── Distillation ───────────────────────────────────────────────────────────

/**
 * Condense all captured sessions + memories into a single ProjectProfile.
 * Rule-based — no LLM required. Runs automatically after N sessions.
 */
export function distillProfile(): ProjectProfile {
  const sessions = getAllSessions();
  const memories = getAllMemories();
  const sessionCount = sessions.length;

  // Collect all decisions and patterns across every session
  const allDecisions: string[] = sessions.flatMap(s => s.decisions);
  const allPatterns: string[] = sessions.flatMap(s => s.patterns);

  // Supplement with key_points from memories
  const memoryPoints: string[] = memories.flatMap(m => m.key_points);
  allDecisions.push(...memoryPoints);

  const decisions = deduplicateStrings(allDecisions, 50);
  const patterns = deduplicateStrings(allPatterns, 30);

  // Current state comes from the most recent session's next_context
  const latestSession = sessions[0] as SessionCapture | undefined;
  const currentState = latestSession?.next_context ?? "";

  // Derive top tags for the summary
  const tagCounts = new Map<string, number>();
  for (const s of sessions) {
    for (const tag of s.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag)
    .filter(t => t !== "session");

  const projectName = config.watchPath.split("/").pop() ?? "project";
  const summary = [
    `Project: ${projectName}.`,
    sessionCount > 0 ? `Distilled from ${sessionCount} sessions.` : "",
    topTags.length > 0 ? `Key areas: ${topTags.join(", ")}.` : "",
    decisions.length > 0 ? `${decisions.length} key decisions recorded.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const profile: ProjectProfile = {
    id: `profile::${Buffer.from(config.watchPath).toString("base64").slice(0, 12)}`,
    project_path: config.watchPath,
    summary,
    decisions,
    patterns,
    current_state: currentState,
    session_count: sessionCount,
    last_distilled_at: Date.now(),
    created_at: Date.now(),
  };

  stmtUpsertProfile.run({
    ...profile,
    decisions: JSON.stringify(profile.decisions),
    patterns: JSON.stringify(profile.patterns),
  });

  return profile;
}

/**
 * Check if distillation should run based on session count and config.
 * Returns true if session count is a multiple of everyNSessions.
 */
export function shouldDistill(everyN: number): boolean {
  const count = getSessionCount();
  return count > 0 && count % everyN === 0;
}

/** Render a ProjectProfile as markdown for use in MCP Resources or tools. */
export function profileToMarkdown(profile: ProjectProfile): string {
  const lastUpdated = new Date(profile.last_distilled_at).toLocaleDateString();
  const lines: string[] = [
    `# Project Context`,
    `> Auto-generated from **${profile.session_count}** sessions · Last updated: ${lastUpdated}`,
    "",
    `## Summary`,
    profile.summary,
    "",
  ];

  if (profile.decisions.length > 0) {
    lines.push("## Key Decisions", ...profile.decisions.map(d => `- ${d}`), "");
  }

  if (profile.patterns.length > 0) {
    lines.push("## Established Patterns", ...profile.patterns.map(p => `- ${p}`), "");
  }

  if (profile.current_state) {
    lines.push("## Current State", profile.current_state, "");
  }

  return lines.join("\n");
}
