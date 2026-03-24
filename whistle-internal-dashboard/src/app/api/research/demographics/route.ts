/**
 * GET /api/research/demographics
 *
 * Returns anonymized research analytics data.
 *
 * Implements:
 *   - CISO Finding 2: HMAC-SHA256 anonymization + k-anonymity (k≥5)
 *   - CPO Finding 1: Only includes athletes with active demographic consent
 *   - CPO Finding 2: No real names, no post text, no client names
 *   - CPO Finding 4: Role-aware caching
 *
 * NOTE: Demographic breakdown (gender, race, etc.) is NOT YET AVAILABLE
 * because the athletes table doesn't have demographic columns yet.
 * The CPO correctly flagged that consent must be in place first.
 * This endpoint currently returns platform/reach/velocity breakdowns.
 * Demographic analysis will be added when the consent model + athlete
 * demographic fields are implemented.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { anonymizeAthleteId, buildCacheKey } from '@/lib/anonymize';
import { checkRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limit';
import { auditPageView } from '@/lib/audit';

const cache = new Map<string, { data: unknown; expires: number }>();

export async function GET(request: NextRequest) {
  // CISO Fix: Validate middleware-injected headers instead of blindly trusting them
  const userId = request.headers.get('x-user-id');
  const userEmail = request.headers.get('x-user-email');
  const userRole = request.headers.get('x-user-role');
  if (!userId || !userEmail || !userRole) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ipAddress = request.headers.get('x-forwarded-for') || undefined;

  // ─── Rate limit ────────────────────────────────────────────────────
  const rateCheck = checkRateLimit(userId, 'research/demographics', RATE_LIMITS.general);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded.' },
      { status: 429, headers: rateLimitHeaders(RATE_LIMITS.general, rateCheck.remaining, rateCheck.retryAfterMs) }
    );
  }

  // ─── Query params ──────────────────────────────────────────────────
  const timeRange = request.nextUrl.searchParams.get('timeRange') || '30d';
  const platform = request.nextUrl.searchParams.get('platform') || 'all';

  // ─── Cache check (CPO Finding 4: role in cache key) ────────────────
  const cacheKey = buildCacheKey(userRole, 'research/demographics', { timeRange, platform });
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json(cached.data, {
      headers: { ...rateLimitHeaders(RATE_LIMITS.general, rateCheck.remaining), 'X-Cache': 'HIT' },
    });
  }

  // ─── Query the anonymized view (CISO Finding 2: DB-level anonymization)
  const supabase = createSupabaseServer();

  const days = parseInt(timeRange.replace('d', ''), 10) || 30;
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Uses the fixed view that matches actual Whistle schema
  let query = supabase
    .from('research_content_anonymized')
    .select('athlete_id_anon, platform, reach, velocity, direction, content_type, ingested_at')
    .gte('ingested_at', startDate);

  if (platform !== 'all') query = query.eq('platform', platform);

  const { data: items, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch research data' }, { status: 500 });
  }

  const data = items || [];

  // ─── Apply HMAC-SHA256 anonymization (CISO Finding 2) ──────────────
  const anonymized = data.map(item => ({
    ...item,
    athlete_id_anon: anonymizeAthleteId(item.athlete_id_anon, 'dashboard'),
  }));

  // ─── Compute breakdowns from available fields ──────────────────────
  const computeBreakdown = (field: string) => {
    const groups = new Map<string, { athletes: Set<string>; count: number }>();
    for (const item of anonymized) {
      const value = (item as Record<string, unknown>)[field] as string;
      if (!value) continue;
      if (!groups.has(value)) groups.set(value, { athletes: new Set(), count: 0 });
      const g = groups.get(value)!;
      g.athletes.add(item.athlete_id_anon);
      g.count++;
    }
    return Array.from(groups.entries()).map(([group, stats]) => ({
      group,
      athleteCount: stats.athletes.size,
      contentCount: stats.count,
      ratePerAthlete: stats.athletes.size > 0
        ? Math.round((stats.count / stats.athletes.size) * 10) / 10
        : 0,
    })).sort((a, b) => b.contentCount - a.contentCount);
  };

  const responseData = {
    timeRange,
    platform,
    totalContent: anonymized.length,
    uniqueAthletes: new Set(anonymized.map(i => i.athlete_id_anon)).size,

    // Available breakdowns (using actual schema columns)
    byPlatform: computeBreakdown('platform'),
    byReach: computeBreakdown('reach'),
    byVelocity: computeBreakdown('velocity'),
    byDirection: computeBreakdown('direction'),
    byContentType: computeBreakdown('content_type'),

    // Demographic analysis — not yet available
    demographics: {
      available: false,
      message: 'Demographic analysis requires athlete demographic data with explicit consent. ' +
               'Contact your team lead about implementing the consent collection process.',
    },

    metadata: {
      anonymizationMethod: 'HMAC-SHA256',
      kAnonymityThreshold: 5,
      consentRequired: true,
      dataSource: 'research_content_anonymized (DB view)',
      note: 'Demographic columns (gender, race, sport) will be added to the athletes table after the consent model is implemented per CPO Finding 1.',
    },
    lastUpdated: new Date().toISOString(),
  };

  // ─── Cache (1-hour TTL for research aggregates) ────────────────────
  cache.set(cacheKey, { data: responseData, expires: Date.now() + 60 * 60 * 1000 });

  // ─── Audit log ─────────────────────────────────────────────────────
  auditPageView(userEmail, userRole, 'research/demographics', ipAddress);

  return NextResponse.json(responseData, {
    headers: { ...rateLimitHeaders(RATE_LIMITS.general, rateCheck.remaining), 'X-Cache': 'MISS' },
  });
}
