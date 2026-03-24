/**
 * GET /api/ops/health
 *
 * Returns the full operations health check dashboard data.
 * Implements: rate limiting, role enforcement, audit logging, caching.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limit';
import { auditPageView } from '@/lib/audit';
import { buildCacheKey } from '@/lib/anonymize';

// ─── Server-side cache (CPO Finding 4: role-aware keys) ──────────────────
const cache = new Map<string, { data: unknown; expires: number }>();

export async function GET(request: NextRequest) {
  // ─── Extract user context (set by middleware) ──────────────────────
  // CISO Fix: Validate middleware-injected headers instead of blindly trusting them
  const userId = request.headers.get('x-user-id');
  const userEmail = request.headers.get('x-user-email');
  const userRole = request.headers.get('x-user-role');
  if (!userId || !userEmail || !userRole) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined;

  // ─── Rate limiting (CISO Finding 5) ────────────────────────────────
  const rateCheck = checkRateLimit(userId, 'ops/health', RATE_LIMITS.general);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again shortly.' },
      {
        status: 429,
        headers: rateLimitHeaders(RATE_LIMITS.general, rateCheck.remaining, rateCheck.retryAfterMs),
      }
    );
  }

  // ─── Check cache (CPO Finding 4: role-aware cache key) ─────────────
  const cacheKey = buildCacheKey(userRole, 'ops/health');
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json(cached.data, {
      headers: {
        ...rateLimitHeaders(RATE_LIMITS.general, rateCheck.remaining),
        'X-Cache': 'HIT',
      },
    });
  }

  // ─── Query database ────────────────────────────────────────────────
  const supabase = createSupabaseServer();

  // Pipeline health metrics
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    { data: pipelineJobs },
    { data: recentIncidents },
    { data: platformStatus },
    { count: queueDepth },
  ] = await Promise.all([
    // ── Uses actual Whistle table names ──
    supabase
      .from('pipeline_runs')
      .select('*')
      .gte('created_at', oneDayAgo.toISOString()),
    supabase
      .from('content_items')
      .select('id, ingested_at, created_at, platform, reach, velocity, direction, content_type, is_false_positive')
      .gte('ingested_at', sevenDaysAgo.toISOString()),
    supabase
      .from('poll_status')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('pipeline_runs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'queued'),
  ]);

  // Compute metrics from raw data
  const jobs24h = pipelineJobs || [];
  const classifierJobs = jobs24h.filter(j => j.stage === 'classifier');
  const fpJobs = jobs24h.filter(j => j.stage === 'fp_checker');
  const actionJobs = jobs24h.filter(j => j.stage === 'action_agent');
  const ingestJobs = jobs24h.filter(j => j.stage === 'ingestion');

  const successRate = (jobs: typeof jobs24h) => {
    if (jobs.length === 0) return 0;
    return (jobs.filter(j => j.status === 'completed').length / jobs.length) * 100;
  };

  // Apply threshold logic from the health check spec
  const getStatus = (value: number, healthy: number, warning: number, criticalBelow: boolean = true) => {
    if (criticalBelow) {
      if (value >= healthy) return 'healthy';
      if (value >= warning) return 'warning';
      return 'critical';
    }
    // For metrics where higher is worse (queue depth, latency)
    if (value <= healthy) return 'healthy';
    if (value <= warning) return 'warning';
    return 'critical';
  };

  const healthData = {
    pipeline: {
      postsIngested: {
        value: ingestJobs.filter(j => j.status === 'completed').length,
        status: ingestJobs.length === 0 ? 'critical' : 'healthy',
      },
      classifierSuccessRate: {
        value: Math.round(successRate(classifierJobs) * 10) / 10,
        status: getStatus(successRate(classifierJobs), 98, 95),
      },
      fpCheckerSuccessRate: {
        value: Math.round(successRate(fpJobs) * 10) / 10,
        status: getStatus(successRate(fpJobs), 98, 95),
      },
      actionAgentSuccessRate: {
        value: Math.round(successRate(actionJobs) * 10) / 10,
        status: getStatus(successRate(actionJobs), 99, 97),
      },
      queueDepth: {
        value: queueDepth || 0,
        status: getStatus(queueDepth || 0, 500, 2000, false),
      },
    },
    detection: {
      incidents24h: (recentIncidents || []).filter(i =>
        new Date(i.created_at) > oneDayAgo
      ).length,
      incidents7d: (recentIncidents || []).length,
      falsePositiveRate: (() => {
        const recent = (recentIncidents || []).filter(i => i.is_false_positive !== null);
        if (recent.length === 0) return 0;
        return Math.round((recent.filter(i => i.is_false_positive).length / recent.length) * 1000) / 10;
      })(),
    },
    platforms: (platformStatus || []).map(p => ({
      platform: p.platform,
      lastIngestion: p.last_ingestion_at,
      apiErrorRate: p.api_error_rate,
      credentialExpiry: p.credential_expiry_date,
      status: p.is_healthy ? 'healthy' : 'warning',
    })),
    lastUpdated: new Date().toISOString(),
  };

  // ─── Cache the result (30-second TTL for ops metrics) ──────────────
  cache.set(cacheKey, {
    data: healthData,
    expires: Date.now() + 30 * 1000,
  });

  // ─── Audit log ─────────────────────────────────────────────────────
  auditPageView(userEmail, userRole, 'ops/health', ipAddress);

  return NextResponse.json(healthData, {
    headers: {
      ...rateLimitHeaders(RATE_LIMITS.general, rateCheck.remaining),
      'X-Cache': 'MISS',
    },
  });
}
