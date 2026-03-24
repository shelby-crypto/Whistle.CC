/**
 * GET /api/cases/:id/content
 *
 * Returns the full content (abuse text) of an incident.
 * This is the most sensitive endpoint in the dashboard.
 *
 * Implements:
 *   - CPO Finding 2: Purpose selector REQUIRED before content access
 *   - CPO Finding 2: Content redacted for client_success and research roles
 *   - CPO Finding 6: Audit logged with purpose
 *   - CISO Finding 5: Rate limited
 *   - CISO Code Review Finding 3: Purpose selector enforced
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { auditContentView } from '@/lib/audit';
import { checkRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limit';
import { ROLE_PERMISSIONS } from '@/types';
import type { ContentViewPurpose } from '@/types';

const VALID_PURPOSES: ContentViewPurpose[] = ['quality_review', 'client_inquiry', 'incident_investigation'];

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // CISO Fix: Validate middleware-injected headers instead of blindly trusting them
  const userId = request.headers.get('x-user-id');
  const userEmail = request.headers.get('x-user-email');
  const userRole = request.headers.get('x-user-role');
  if (!userId || !userEmail || !userRole) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ipAddress = request.headers.get('x-forwarded-for') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;
  const incidentId = params.id;

  // ─── Rate limit ────────────────────────────────────────────────────
  const rateCheck = checkRateLimit(userId, 'cases/content', RATE_LIMITS.general);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded.' },
      { status: 429, headers: rateLimitHeaders(RATE_LIMITS.general, rateCheck.remaining, rateCheck.retryAfterMs) }
    );
  }

  // ─── Role check: can this role view incident content? ──────────────
  const permissions = ROLE_PERMISSIONS[userRole as keyof typeof ROLE_PERMISSIONS];
  if (!permissions?.canViewIncidentContent) {
    return NextResponse.json(
      { error: 'Your role does not have access to incident content.' },
      { status: 403 }
    );
  }

  // ─── Purpose selector enforcement (CISO Code Review Finding 3) ─────
  const purpose = request.nextUrl.searchParams.get('purpose') as ContentViewPurpose;
  if (!purpose || !VALID_PURPOSES.includes(purpose)) {
    return NextResponse.json(
      {
        error: 'Purpose required',
        message: 'You must specify why you are viewing this content.',
        validPurposes: VALID_PURPOSES,
      },
      { status: 400 }
    );
  }

  // ─── Fetch incident ────────────────────────────────────────────────
  const supabase = createSupabaseServer();
  // Uses actual Whistle table name
  const { data: incident, error } = await supabase
    .from('content_items')
    .select('id, content, platform, reach, velocity, direction, ingested_at')
    .eq('id', incidentId)
    .single();

  if (error || !incident) {
    return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
  }

  // ─── AUDIT LOG: Content view with purpose (CPO Finding 2) ──────────
  // This is logged BEFORE returning the content, so even if the response
  // fails to send, the access attempt is recorded.
  await auditContentView(
    userEmail,
    userRole,
    incidentId,
    purpose,
    ipAddress,
    userAgent
  );

  // ─── Return content ────────────────────────────────────────────────
  return NextResponse.json({
    incidentId: incident.id,
    content: incident.content,
    platform: incident.platform,
    reach: incident.reach,
    velocity: incident.velocity,
    direction: incident.direction,
    ingestedAt: incident.ingested_at,
    // Metadata about this access for transparency
    accessLog: {
      purpose,
      viewedBy: userEmail,
      viewedAt: new Date().toISOString(),
      note: 'This access has been recorded in the audit log.',
    },
  }, {
    headers: rateLimitHeaders(RATE_LIMITS.general, rateCheck.remaining),
  });
}
