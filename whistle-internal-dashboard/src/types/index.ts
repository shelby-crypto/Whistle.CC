// ─── Core Types ──────────────────────────────────────────────────────────

export type UserRole = 'ops' | 'client_success' | 'leadership' | 'research';

export interface DashboardUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  allowedClientIds: string[] | null;
  isActive: boolean;
  dataUseAgreedAt: string | null;
  dataUseVersion: string | null;
}

export interface SessionInfo {
  userId: string;
  email: string;
  role: UserRole;
  sessionId: string;
  expiresAt: string;
  idleTimeoutAt: string;
}

export type MetricStatus = 'healthy' | 'warning' | 'critical';

export type AuditAction =
  | 'login' | 'logout' | 'session_refresh' | 'session_revoke'
  | 'view_page' | 'view_metric_detail'
  | 'view_incident_content'
  | 'search_cases'
  | 'export_csv' | 'export_pdf' | 'export_png'
  | 'export_approved' | 'export_denied'
  | 'data_use_agreement_accepted'
  | 'role_granted' | 'role_revoked'
  | 'consent_recorded' | 'consent_withdrawn';

export type ContentViewPurpose = 'quality_review' | 'client_inquiry' | 'incident_investigation';

export interface AuditEntry {
  userEmail: string;
  userRole: string;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  viewPurpose?: ContentViewPurpose;
  exportQueryParams?: Record<string, unknown>;
  exportRecordCount?: number;
  exportFileHash?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export type HarmCategory =
  | 'Racial abuse' | 'Sexual harassment' | 'Homophobia' | 'Transphobia'
  | 'Body shaming' | 'Death threats' | 'Doxxing' | 'Gendered slurs'
  | 'Religious discrimination' | 'Disability mockery'
  | 'Nationalism/xenophobia' | 'Coordinated pile-on' | 'Dehumanization';

export interface Incident {
  id: string;
  createdAt: string;
  platform: 'X' | 'YouTube' | 'Instagram';
  harmCategory: HarmCategory;
  severityScore: number;
  confidenceScore: number;
  athleteIdAnon: string;    // Always anonymized by default
  athleteName?: string;     // Only present for non-research roles
  clientName?: string;      // Only present for non-research roles
  postText?: string;        // Only present after content warning + purpose selection
  status: 'confirmed' | 'dismissed' | 'pending';
  actionTaken?: string;
}

// ─── RBAC Permission Matrix ──────────────────────────────────────────────
// Maps directly to the architecture document's RBAC table

export const ROLE_PERMISSIONS: Record<UserRole, {
  ops: 'full' | 'summary' | 'none';
  detection: 'full' | 'aggregated' | 'none';
  platforms: 'full' | 'summary' | 'none';
  costs: 'full' | 'view' | 'none';
  clientHealth: 'full' | 'none';
  business: 'full' | 'none';
  research: 'full' | 'none';
  caseLookup: 'full' | 'client_scoped' | 'anonymized' | 'technical' | 'none';
  exports: 'all' | 'client' | 'research' | 'none';
  canViewIncidentContent: boolean;
  canViewAthleteNames: boolean;
  canViewClientNames: boolean;
}> = {
  ops: {
    ops: 'full', detection: 'full', platforms: 'full', costs: 'view',
    clientHealth: 'none', business: 'none', research: 'none',
    caseLookup: 'technical', exports: 'none',
    canViewIncidentContent: true, canViewAthleteNames: true, canViewClientNames: false,
  },
  client_success: {
    ops: 'summary', detection: 'full', platforms: 'summary', costs: 'none',
    clientHealth: 'full', business: 'none', research: 'none',
    caseLookup: 'client_scoped', exports: 'client',
    canViewIncidentContent: false, canViewAthleteNames: true, canViewClientNames: true,
  },
  leadership: {
    ops: 'full', detection: 'full', platforms: 'full', costs: 'full',
    clientHealth: 'full', business: 'full', research: 'full',
    caseLookup: 'full', exports: 'all',
    canViewIncidentContent: true, canViewAthleteNames: true, canViewClientNames: true,
  },
  research: {
    ops: 'none', detection: 'aggregated', platforms: 'none', costs: 'none',
    clientHealth: 'none', business: 'none', research: 'full',
    caseLookup: 'anonymized', exports: 'research',
    canViewIncidentContent: false, canViewAthleteNames: false, canViewClientNames: false,
  },
};
