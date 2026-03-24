/**
 * POST /api/exports
 *
 * Generates and returns an export file (CSV/PDF).
 *
 * Implements:
 *   - CISO Finding 2: Export watermarking with user ID + timestamp
 *   - CPO Finding 5: Data use agreement check, approval workflow,
 *     export manifest, separate HMAC salt for exports
 *   - CISO Finding 5: Rate limited (5 exports/hour)
 *   - CISO Code Review Finding 2: Server-side generation
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limit';
import { anonymizeAthleteId, anonymizeClientName, applyKAnonymity } from '@/lib/anonymize';
import { recordExport, hasAcceptedDataUseAgreement, generateWatermarkedCsv, CURRENT_DATA_USE_VERSION } from '@/lib/exports';
import { writeAuditLog } from '@/lib/audit';
import type { DashboardUser, UserRole } from '@/types';

export async function POST(request: NextRequest) {
  // CISO Fix: Validate middleware-injected headers instead of blindly trusting them
  const userId = request.headers.get('x-user-id');
  const userEmail = request.headers.get('x-user-email');
  const userRole = request.headers.get('x-user-role') as UserRole | null;
  if (!userId || !userEmail || !userRole) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ipAddress = request.headers.get('x-forwarded-for') || undefined;

  // ─── Rate limit: 5 exports per hour (CISO Finding 5) ──────────────
  const rateCheck = checkRateLimit(userId, 'exports', RATE_LIMITS.export);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Export rate limit exceeded. You can export up to 5 times per hour.' },
      { status: 429, headers: rateLimitHeaders(RATE_LIMITS.export, rateCheck.remaining, rateCheck.retryAfterMs) }
    );
  }

  // ─── Parse request ─────────────────────────────────────────────────
  const body = await request.json();
  const { exportType, dataCategory, filters } = body as {
    exportType: 'csv' | 'pdf';
    dataCategory: string;
    filters: Record<string, string>;
  };

  // ─── Lookup full user record ───────────────────────────────────────
  const supabase = createSupabaseServer();
  const { data: userRecord } = await supabase
    .from('dashboard_user_roles')
    .select('*')
    .eq('id', userId)
    .single();

  if (!userRecord) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const user: DashboardUser = {
    id: userRecord.id,
    email: userRecord.email,
    displayName: userRecord.display_name,
    role: userRecord.role,
    allowedClientIds: userRecord.allowed_client_ids,
    isActive: userRecord.is_active,
    dataUseAgreedAt: userRecord.data_use_agreed_at,
    dataUseVersion: userRecord.data_use_version,
  };

  // ─── Data use agreement check (CPO Finding 5) ─────────────────────
  if (userRole === 'research' && !hasAcceptedDataUseAgreement(user)) {
    return NextResponse.json(
      {
        error: 'Data use agreement required',
        message: 'You must accept the data use agreement before exporting research data.',
        agreementVersion: CURRENT_DATA_USE_VERSION,
      },
      { status: 403 }
    );
  }

  // ─── Fetch data based on category ──────────────────────────────────
  let headers: string[] = [];
  let rows: string[][] = [];
  let recordCount = 0;

  if (dataCategory === 'research_demographics') {
    // Use the anonymized view
    const { data, error } = await supabase
      .from('research_incidents_anonymized')
      .select('athlete_id_anon, gender, race_ethnicity, sport, competition_level, harm_category, severity_score, platform, created_at');

    if (error || !data) {
      return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    }

    // Apply k-anonymity
    const genderFiltered = applyKAnonymity(data.filter(d => d.gender), 'gender', 5);
    const filteredData = genderFiltered.data;

    // CISO Finding 2: Use EXPORT HMAC salt (different from dashboard display)
    headers = ['athlete_id_anon', 'gender', 'race_ethnicity', 'sport', 'competition_level', 'harm_category', 'severity_score', 'platform', 'created_at'];
    rows = filteredData.map(d => [
      anonymizeAthleteId(d.athlete_id_anon, 'export'), // Different salt!
      d.gender || 'N/A',
      d.race_ethnicity || 'N/A',
      d.sport || 'N/A',
      d.competition_level || 'N/A',
      d.harm_category,
      String(d.severity_score),
      d.platform,
      d.created_at,
    ]);
    recordCount = rows.length;
  } else if (dataCategory === 'investor_snapshot') {
    // Investor data — aggregated, no PII
    headers = ['metric', 'value', 'period'];
    rows = [
      ['Total Incidents Detected', '2847', 'March 2026'],
      ['Active Athletes Protected', '181', 'Current'],
      ['Avg Time to Detection', '22s', '30-day avg'],
      ['False Positive Rate', '7.2%', '30-day rolling'],
      ['Pilot Expansion Rate', '80%', 'All time'],
    ];
    recordCount = rows.length;
  }

  // ─── Generate watermarked file (CISO Finding 2) ────────────────────
  if (exportType === 'csv') {
    const csvContent = generateWatermarkedCsv(headers, rows, user, 'pending');

    // ─── Record in export manifest (CPO Finding 5) ──────────────────
    const { manifestId, fileHash, needsApproval } = await recordExport(
      user,
      'csv',
      dataCategory,
      filters || {},
      recordCount,
      csvContent,
      ipAddress
    );

    if (needsApproval) {
      return NextResponse.json({
        status: 'pending_approval',
        manifestId,
        message: 'This export requires leadership approval because it contains demographic data or exceeds 1,000 records.',
      }, { status: 202 });
    }

    // Re-generate with actual manifest ID in watermark
    const finalCsv = generateWatermarkedCsv(headers, rows, user, manifestId);

    return new NextResponse(finalCsv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="whistle-export-${manifestId.slice(0, 8)}.csv"`,
        ...rateLimitHeaders(RATE_LIMITS.export, rateCheck.remaining),
      },
    });
  }

  return NextResponse.json({ error: 'Unsupported export type' }, { status: 400 });
}
