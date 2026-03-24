/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUDIT LOGGING
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Implements:
 *   - CISO Finding 4: Append-only audit trail (DB trigger prevents modification)
 *   - CPO Finding 2: Content access logging with purpose tracking
 *   - CPO Finding 5: Export manifest tracking
 *
 * Every data access, content view, search, and export is logged.
 * The audit_log table has triggers preventing UPDATE and DELETE —
 * even if this code has a bug, the DB won't let records be erased.
 */

import { createSupabaseAdmin } from '@/lib/supabase/server';
import type { AuditEntry } from '@/types';

/**
 * Write an audit log entry. This is append-only — the database
 * trigger prevents any modification after insertion.
 *
 * IMPORTANT: This function never throws. A failed audit write
 * should log to console.error but not break the user's request.
 * The audit trail is critical but should not degrade user experience.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const admin = createSupabaseAdmin();

    await admin.from('dashboard_audit_log').insert({
      user_email: entry.userEmail,
      user_role: entry.userRole,
      action: entry.action,
      resource_type: entry.resourceType || null,
      resource_id: entry.resourceId || null,
      view_purpose: entry.viewPurpose || null,
      export_query_params: entry.exportQueryParams || null,
      export_record_count: entry.exportRecordCount || null,
      export_file_hash: entry.exportFileHash || null,
      ip_address: entry.ipAddress || null,
      user_agent: entry.userAgent || null,
      metadata: entry.metadata || {},
    });
  } catch (error) {
    // Audit failure should never crash the request — but we MUST log it
    console.error('[AUDIT] Failed to write audit log entry:', {
      action: entry.action,
      userEmail: entry.userEmail,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Convenience: Log a page view.
 */
export async function auditPageView(
  userEmail: string,
  userRole: string,
  page: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await writeAuditLog({
    userEmail,
    userRole,
    action: 'view_page',
    resourceType: 'page',
    resourceId: page,
    ipAddress,
    userAgent,
  });
}

/**
 * Convenience: Log a content view (abuse text reveal).
 * CPO Finding 2: Purpose is REQUIRED for content views.
 */
export async function auditContentView(
  userEmail: string,
  userRole: string,
  incidentId: string,
  purpose: 'quality_review' | 'client_inquiry' | 'incident_investigation',
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await writeAuditLog({
    userEmail,
    userRole,
    action: 'view_incident_content',
    resourceType: 'incident',
    resourceId: incidentId,
    viewPurpose: purpose,
    ipAddress,
    userAgent,
  });
}

/**
 * Convenience: Log an export.
 * CPO Finding 5: Full export manifest with query params and file hash.
 */
export async function auditExport(
  userEmail: string,
  userRole: string,
  exportType: 'csv' | 'pdf' | 'png',
  queryParams: Record<string, unknown>,
  recordCount: number,
  fileHash: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await writeAuditLog({
    userEmail,
    userRole,
    action: `export_${exportType}` as AuditEntry['action'],
    resourceType: 'export',
    exportQueryParams: queryParams,
    exportRecordCount: recordCount,
    exportFileHash: fileHash,
    ipAddress,
    userAgent,
  });
}

/**
 * Convenience: Log a case search.
 */
export async function auditSearch(
  userEmail: string,
  userRole: string,
  searchQuery: string,
  resultCount: number,
  ipAddress?: string
): Promise<void> {
  await writeAuditLog({
    userEmail,
    userRole,
    action: 'search_cases',
    resourceType: 'search',
    metadata: { query: searchQuery, resultCount },
    ipAddress,
  });
}
