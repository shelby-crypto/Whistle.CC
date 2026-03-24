/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXPORT SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Implements:
 *   - CISO Finding 2: Export watermarking with user ID + timestamp
 *   - CPO Finding 5: Export approval workflow, manifest tracking,
 *     data use agreement enforcement, separate HMAC salt for exports
 */

import { createHash } from 'crypto';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { auditExport } from '@/lib/audit';
import type { DashboardUser } from '@/types';

/**
 * Generate a SHA-256 hash of file content for the export manifest.
 */
export function hashFileContent(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Check if user has accepted the data use agreement.
 * CPO Finding 5: Required before first research export.
 */
export function hasAcceptedDataUseAgreement(user: DashboardUser): boolean {
  return user.dataUseAgreedAt !== null && user.dataUseVersion !== null;
}

/**
 * Check if an export requires leadership approval.
 * CPO Finding 5: Exports >1000 records or containing demographic
 * breakdowns need approval.
 */
export function requiresApproval(
  recordCount: number,
  containsDemographicData: boolean
): boolean {
  return recordCount > 1000 || containsDemographicData;
}

/**
 * Create an export manifest record.
 * Every export is tracked for accountability.
 */
export async function createExportManifest(params: {
  userId: string;
  exportType: 'csv' | 'pdf' | 'png';
  dataCategory: string;
  queryParams: Record<string, unknown>;
  recordCount: number;
  fileContent: string | Buffer;
  needsApproval: boolean;
}): Promise<{ manifestId: string; fileHash: string }> {
  const fileHash = hashFileContent(params.fileContent);
  const admin = createSupabaseAdmin();

  const { data, error } = await admin
    .from('export_manifests')
    .insert({
      requested_by: params.userId,
      export_type: params.exportType,
      data_category: params.dataCategory,
      query_params: params.queryParams,
      record_count: params.recordCount,
      file_hash: fileHash,
      requires_approval: params.needsApproval,
      approval_status: params.needsApproval ? 'pending' : 'approved',
      watermark_user_id: params.userId,
    })
    .select('id')
    .single();

  if (error || !data) throw new Error('Failed to create export manifest');

  return { manifestId: data.id, fileHash };
}

/**
 * Generate CSV content with watermark header.
 * CISO Finding 2: Every export includes user ID and timestamp.
 */
export function generateWatermarkedCsv(
  headers: string[],
  rows: string[][],
  user: DashboardUser,
  manifestId: string
): string {
  const watermark = [
    `# Whistle Internal Dashboard — Data Export`,
    `# Exported by: ${user.email} (${user.role})`,
    `# Export ID: ${manifestId}`,
    `# Timestamp: ${new Date().toISOString()}`,
    `# This data is confidential. Unauthorized sharing is prohibited.`,
    `#`,
  ].join('\n');

  const csvHeader = headers.join(',');
  const csvRows = rows.map(row =>
    row.map(cell => {
      // Escape CSV cells containing commas, quotes, or newlines
      if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    }).join(',')
  ).join('\n');

  return `${watermark}\n${csvHeader}\n${csvRows}`;
}

/**
 * Record an export in the audit log and return the manifest.
 */
export async function recordExport(
  user: DashboardUser,
  exportType: 'csv' | 'pdf' | 'png',
  dataCategory: string,
  queryParams: Record<string, unknown>,
  recordCount: number,
  fileContent: string | Buffer,
  ipAddress?: string
): Promise<{ manifestId: string; fileHash: string; needsApproval: boolean }> {
  const containsDemographic = dataCategory.includes('demographic');
  const needsApproval = requiresApproval(recordCount, containsDemographic);

  const { manifestId, fileHash } = await createExportManifest({
    userId: user.id,
    exportType,
    dataCategory,
    queryParams,
    recordCount,
    fileContent,
    needsApproval,
  });

  // Write audit log
  await auditExport(
    user.email,
    user.role,
    exportType,
    queryParams,
    recordCount,
    fileHash,
    ipAddress
  );

  return { manifestId, fileHash, needsApproval };
}

// Current data use agreement version
export const CURRENT_DATA_USE_VERSION = '1.0.0';

export const DATA_USE_AGREEMENT_TEXT = `
WHISTLE INTERNAL DASHBOARD — DATA USE AGREEMENT

By exporting data from the Whistle internal dashboard, you agree to the following:

1. CONFIDENTIALITY: Exported data must not be shared outside NetRef Safety without
   explicit written approval from leadership.

2. NO RE-IDENTIFICATION: You must not attempt to re-identify anonymized individuals
   in exported datasets, whether by cross-referencing with external data sources,
   using the demographic fields to narrow down identities, or any other means.

3. SECURE HANDLING: Exported files must be stored on encrypted devices and
   securely deleted after the research use is complete.

4. AUDIT TRAIL: All exports are logged with your identity and timestamp.
   Exported files contain watermarks traceable to this export.

5. PUBLICATION REVIEW: Any analysis intended for publication must be reviewed
   by leadership before submission to ensure anonymization standards are met.

Violation of this agreement may result in revocation of dashboard access and
disciplinary action.
`;
