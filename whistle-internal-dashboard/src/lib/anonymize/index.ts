/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ANONYMIZATION UTILITIES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Implements CISO Finding 2:
 *   - HMAC-SHA256 with externalized salt (env var, never in code)
 *   - Separate salt for exports vs. dashboard display
 *   - K-anonymity suppression (k ≥ 5) for demographic queries
 *
 * Also implements CPO Finding 4:
 *   - Role-aware cache keys to prevent cross-role data leakage
 */

import { createHmac } from 'crypto';

// ─── HMAC-SHA256 Anonymization ───────────────────────────────────────────

/**
 * Anonymizes an athlete ID using HMAC-SHA256.
 * The result is a deterministic but non-reversible identifier.
 *
 * CISO REQUIREMENT: The salt comes from environment variables.
 * Different salts for dashboard display vs. exports prevent
 * correlation between the two datasets.
 */
export function anonymizeAthleteId(
  athleteId: string,
  context: 'dashboard' | 'export' = 'dashboard'
): string {
  const secret = context === 'export'
    ? process.env.EXPORT_HMAC_SECRET
    : process.env.ANONYMIZATION_HMAC_SECRET;

  if (!secret) {
    throw new Error(
      `CRITICAL: ${context === 'export' ? 'EXPORT_HMAC_SECRET' : 'ANONYMIZATION_HMAC_SECRET'} ` +
      'environment variable is not set. Cannot anonymize data without HMAC salt.'
    );
  }

  const hmac = createHmac('sha256', secret);
  hmac.update(athleteId);
  const hash = hmac.digest('hex');

  // Return a human-friendly prefix for display (first 8 chars of HMAC)
  // Format: "Athlete #A7F29B3C" — deterministic but non-reversible
  return `Athlete #${hash.substring(0, 8).toUpperCase()}`;
}

/**
 * Anonymizes a client name for research context.
 * Uses the same HMAC approach but with "client:" prefix to ensure
 * different hashes from athlete IDs.
 */
export function anonymizeClientName(
  clientName: string,
  context: 'dashboard' | 'export' = 'dashboard'
): string {
  const secret = context === 'export'
    ? process.env.EXPORT_HMAC_SECRET
    : process.env.ANONYMIZATION_HMAC_SECRET;

  if (!secret) throw new Error('HMAC secret not configured');

  const hmac = createHmac('sha256', secret);
  hmac.update(`client:${clientName}`);
  const hash = hmac.digest('hex');

  return `Org #${hash.substring(0, 6).toUpperCase()}`;
}


// ─── K-Anonymity Suppression ─────────────────────────────────────────────

/**
 * CISO Finding 2: Suppress demographic groups with fewer than k individuals.
 * Prevents re-identification through small group sizes.
 *
 * Example: If only 1 openly LGBTQ athlete exists in college volleyball,
 * showing any data about that group is a re-identification, not anonymization.
 *
 * @param data Array of demographic data points
 * @param groupField The field to group by (e.g., 'gender', 'race_ethnicity')
 * @param k Minimum group size (default 5, per CISO requirement)
 * @returns Filtered array with small groups removed + suppression metadata
 */
export function applyKAnonymity<T extends Record<string, unknown>>(
  data: T[],
  groupField: keyof T,
  k: number = 5
): {
  data: T[];
  suppressedGroups: { group: string; count: number }[];
  totalSuppressed: number;
} {
  // Count members per group
  const groupCounts = new Map<string, number>();
  for (const item of data) {
    const group = String(item[groupField] ?? 'unknown');
    groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
  }

  // Identify groups below threshold
  const suppressedGroups: { group: string; count: number }[] = [];
  const allowedGroups = new Set<string>();

  for (const [group, count] of Array.from(groupCounts.entries())) {
    if (count >= k) {
      allowedGroups.add(group);
    } else {
      suppressedGroups.push({ group, count });
    }
  }

  // Filter data to only include allowed groups
  const filteredData = data.filter(item =>
    allowedGroups.has(String(item[groupField] ?? 'unknown'))
  );

  return {
    data: filteredData,
    suppressedGroups,
    totalSuppressed: data.length - filteredData.length,
  };
}


// ─── Role-Aware Cache Keys ───────────────────────────────────────────────

/**
 * CPO Finding 4: Cache keys MUST include the user's role.
 * Prevents a leadership request (with real names) from being served
 * to a research user (who should only see anonymized data).
 */
export function buildCacheKey(
  role: string,
  endpoint: string,
  params: Record<string, string | number | boolean> = {}
): string {
  const paramsHash = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  return `${role}:${endpoint}:${paramsHash}`;
}


// ─── Data Redaction by Role ──────────────────────────────────────────────

/**
 * CPO Finding 2: Redact fields based on user role.
 * This runs at the API layer before data reaches the client.
 */
export function redactForRole<T extends Record<string, unknown>>(
  data: T,
  role: string,
  fieldsToRedact: Record<string, string[]> // role -> fields to remove
): Partial<T> {
  const redactFields = fieldsToRedact[role] || [];
  const result = { ...data };

  for (const field of redactFields) {
    delete (result as Record<string, unknown>)[field];
  }

  return result;
}

// Standard redaction config per role
export const INCIDENT_REDACTION: Record<string, string[]> = {
  research: ['athleteName', 'clientName', 'postText', 'postUrl', 'socialHandle'],
  client_success: ['postText'],  // CPO: client_success sees metadata, not abuse text
  ops: [],                        // Ops can see content (after content warning)
  leadership: [],                 // Leadership can see everything
};
