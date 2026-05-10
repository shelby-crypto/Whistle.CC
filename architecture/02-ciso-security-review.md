# CISO Security Review — Whistle Internal Dashboard Architecture

**Classification:** Internal — Confidential
**Reviewer:** CISO | **Date:** 2026-03-20 | **Version:** 1.0
**Document Under Review:** 01-system-architecture.md
**Overall Verdict:** CONDITIONALLY APPROVED — 2 High findings, 4 Medium findings, 2 Informational items. Address the High findings before any code reaches a staging environment. This architecture is sound in structure — the read-replica isolation and RBAC model are both strong foundations — but the implementation details around session management, audit logging, and data anonymization need tightening before this handles real athlete PII.

---

## Executive Summary

The proposed architecture makes several strong security decisions out of the gate. The read-only replica isolation is the right call — it eliminates an entire class of accidental write-path corruption and means a compromised dashboard session can never poison the production pipeline. The RBAC model with 4 distinct roles maps cleanly to the principle of least privilege. Google SSO with no self-registration closes the most common internal tool vulnerability (unauthorized access via forgotten signup pages).

That said, there are gaps that need to be closed. The most important: the architecture document doesn't specify how session tokens are stored, validated, or expired. And the anonymization strategy — "strip at the query layer" — needs much more rigor before it handles demographic data about real athletes. These are the two areas where a mistake will have real consequences.

---

## Findings

### Finding 1 — Session Management Unspecified

**Severity:** HIGH
**Affected Component:** Auth Middleware, Supabase Auth
**CWE:** CWE-613 (Insufficient Session Expiration)
**SOC 2 Mapping:** CC6.1 (Logical Access Security)

**The problem:** The architecture says "Google SSO via Supabase Auth" but doesn't specify session token storage, expiration policy, or refresh behavior. This is the kind of detail that seems minor until an employee's laptop is stolen and their session token grants access to athlete PII for the next 30 days.

**What needs to be defined:**

| Parameter | Requirement |
|---|---|
| Session token storage | HTTP-only, Secure, SameSite=Strict cookies. Never localStorage. |
| Session duration | 8 hours maximum for active sessions |
| Idle timeout | 30 minutes of inactivity triggers re-authentication |
| Token refresh | Sliding window refresh allowed during active use; hard expiry at 8 hours |
| Concurrent sessions | Allow up to 2 (desktop + mobile); alert on 3+ |
| Session revocation | Leadership role can revoke any user's sessions immediately |
| Logout behavior | Clear all session tokens + Supabase Auth signout; redirect to login |

**Why this matters:** This dashboard will display athlete names, demographic data, abuse content, and business financials. A session that never expires is a standing invitation for unauthorized access. For SOC 2, your auditor will ask "how long is a session valid?" and "what happens when an employee leaves?" — you need clear answers.

**Remediation:** Implement the session parameters above in the auth middleware. Supabase Auth supports configurable JWT expiration — set it to 8 hours with a 30-minute refresh window. Store the session cookie with `httpOnly: true, secure: true, sameSite: 'strict'`.

---

### Finding 2 — Anonymization Strategy Needs Cryptographic Rigor

**Severity:** HIGH
**Affected Component:** Query Layer, Anonymize Utilities
**CWE:** CWE-327 (Use of a Broken or Risky Cryptographic Algorithm)
**SOC 2 Mapping:** CC6.5 (Data Classification and Handling)

**The problem:** The architecture says the research role sees "anonymized IDs" with "real names stripped at the query layer." But it doesn't specify the anonymization mechanism. If `athlete_id_anon` is just `MD5(athlete_name)` or a sequential integer, a researcher with knowledge of athlete names can trivially reverse it. Given that the research dataset includes gender, sport, competition level, and race/ethnicity — the combination of those fields alone can re-identify most athletes even without the name.

**What needs to be defined:**

1. **Anonymization method:** Use HMAC-SHA256 with a secret salt stored in environment variables, never in the codebase. The salt must be rotated if it is ever exposed.

2. **K-anonymity for demographic queries:** When the research view returns demographic breakdowns, suppress any group with fewer than 5 athletes. A query result showing "1 openly LGBTQ athlete in women's college volleyball" is a re-identification, not anonymization.

3. **Query-level enforcement, not UI-level:** The architecture already calls for this — good. But enforce it in PostgreSQL views, not just application code. Create a `research_incidents_view` that joins against anonymized athlete IDs and strips PII columns at the database level. This way, even a SQL injection in the research query path cannot reach real names.

4. **Export watermarking:** Every CSV/PDF export from the research view should include a watermark with the exporting user's ID and timestamp. If anonymized data leaks, you can trace the source.

**Why this matters:** This dataset contains abuse incidents linked to athlete demographics including race, LGBTQ status, and disability. If a researcher (or anyone who gains access to a research export) can re-identify athletes, you've created a document that links named individuals to their abuse history and demographic characteristics. That's not just a privacy breach — it's a potential harm to the athletes you exist to protect.

**Remediation:** Implement HMAC-SHA256 anonymization, k-anonymity suppression (k≥5), database-level anonymized views, and export watermarking.

---

### Finding 3 — Read Replica Credentials Need Isolation

**Severity:** MEDIUM
**Affected Component:** Data Layer, Supabase Read Replica
**CWE:** CWE-250 (Execution with Unnecessary Privileges)
**SOC 2 Mapping:** CC6.3 (Role-Based Access)

**The problem:** The architecture says the dashboard reads from a Supabase read replica, but doesn't specify which database credentials the dashboard uses. If the dashboard connects with the same credentials as the production pipeline (or the Supabase service role key), a vulnerability in the dashboard could read data it shouldn't — or worse, if someone accidentally points it at the production DB instead of the replica, it could have write access.

**Requirement:** Create a dedicated PostgreSQL role for the dashboard:
```sql
CREATE ROLE dashboard_reader WITH LOGIN PASSWORD '...' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE whistle_replica TO dashboard_reader;
GRANT USAGE ON SCHEMA public TO dashboard_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO dashboard_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO dashboard_reader;
-- Explicitly deny write operations
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM dashboard_reader;
```

This ensures the dashboard literally cannot write to the database, even if a code bug or misconfiguration tries to. Defense in depth.

---

### Finding 4 — Audit Log Needs Tamper Protection

**Severity:** MEDIUM
**Affected Component:** Audit Log
**CWE:** CWE-779 (Logging of Excessive Data)
**SOC 2 Mapping:** CC7.2 (System Monitoring)

**The problem:** The architecture includes an audit log (good), but stores it in the same Supabase instance the dashboard connects to. If the dashboard has write access to the audit log table (which it needs to *write* log entries), a compromised session could delete or modify its own audit trail.

**Requirement:** The audit log must be append-only. Implement this via:
1. A PostgreSQL trigger that prevents `UPDATE` and `DELETE` on the `audit_log` table
2. The dashboard writes audit entries via a Supabase Edge Function (separate credentials) rather than directly
3. Alternatively, ship audit logs to an external append-only store (e.g., a separate Supabase project, or a simple log drain)

For a startup at this scale, option 1 (append-only trigger) is the pragmatic choice. Add option 3 when you scale.

---

### Finding 5 — Rate Limiting on API Routes

**Severity:** MEDIUM
**Affected Component:** API Layer
**CWE:** CWE-770 (Allocation of Resources Without Limits)

**The problem:** The architecture doesn't mention rate limiting. Even for an internal tool with 5-10 users, you need basic rate limiting because: (a) a runaway script or browser tab refreshing in a loop can hammer the read replica, (b) if a session token is compromised, rate limiting contains the blast radius, and (c) the research export endpoint could be abused to bulk-download the entire dataset.

**Requirement:**
- General API routes: 60 requests/minute per user
- Research export endpoint: 5 exports/hour per user
- Case lookup search: 30 searches/minute per user
- Implement via Vercel's `@vercel/edge-config` rate limiter or a simple in-memory counter (appropriate at this scale)

---

### Finding 6 — Content Security Policy Headers

**Severity:** MEDIUM
**Affected Component:** Frontend, Vercel Deployment
**CWE:** CWE-1021 (Improper Restriction of Rendered UI Layers)

**The problem:** No mention of security headers. For a dashboard displaying sensitive data, these are mandatory:

```typescript
// next.config.js headers
{
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co;",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
}
```

These prevent clickjacking (the dashboard can't be embedded in an iframe on a malicious site), enforce HTTPS, and restrict what the page can load. Non-negotiable for any internal tool handling PII.

---

### Finding 7 — Environment Variable Hygiene (Informational)

**Severity:** INFORMATIONAL
**Affected Component:** All

Good practice reminder: The Supabase connection string, HMAC salt for anonymization, and Google OAuth client secret must live in Vercel environment variables, never in the codebase. The `.env.local` file should be in `.gitignore`. Vercel's environment variable UI supports separate values for production, preview, and development — use this to ensure preview deployments never connect to the production replica.

---

### Finding 8 — Incident Response Plan for Dashboard (Informational)

**Severity:** INFORMATIONAL
**Affected Component:** Operations

Before launch, document answers to these questions:
- If a dashboard user's Google account is compromised, who revokes their dashboard session and how?
- If the audit log reveals unauthorized data access, what's the notification procedure?
- If a research export containing athlete data is leaked, what's the response plan?

These don't need engineering work — they need a one-page runbook that names the person responsible for each scenario.

---

## Data Source Recommendation

The architecture asked for my recommendation on data source approach. **I confirm: use the read replica.**

Here's why, stated as a security requirement rather than a preference:

1. **Blast radius containment.** If the dashboard has a vulnerability (SQL injection, SSRF, whatever), the attacker gets read access to a replica. They cannot modify production data, inject false incidents, or disrupt the pipeline. This is the single most important security property of the architecture.

2. **Credential isolation.** The dashboard uses its own read-only database role. Even if those credentials leak, the worst case is unauthorized data reading — not data modification or deletion.

3. **Operational safety.** A badly-written dashboard query (an unindexed join across millions of rows) slows down the replica, not the production classifier that needs sub-second latency to detect abuse in real time.

If Supabase's plan doesn't support a true read replica, the fallback is: create a read-only PostgreSQL role on the production database, enforce connection pooling with a max of 5 connections for the dashboard, and set a 30-second query timeout. This gives you credential isolation and limits damage, even without physical separation. But push for the replica — it's worth the cost.

---

## What's Done Well

Credit where due — several aspects of this architecture reflect solid security thinking:

1. **Read-only separation from production.** This is the right instinct and the right architecture. Many startups skip this and regret it when a dashboard query takes down their production API.

2. **No self-registration.** The "leadership must manually add users" policy eliminates the most common internal tool vulnerability. An exposed signup page is how most unauthorized access happens.

3. **Anonymization at the query layer, not the UI layer.** The architecture explicitly calls this out. This is correct — if you strip PII in the UI, it's still in the API response, and anyone with browser dev tools can see it. Stripping at the query layer means the data never leaves the database in identifiable form for the research role.

4. **Audit logging for research access.** Given that this data will eventually support academic publications and possibly policy testimony, having a complete audit trail of who accessed what research data and when is both a regulatory requirement and a credibility asset.

5. **RBAC with granular view permissions.** The 4-role model with different view access per role is the right granularity for this team size. Don't over-engineer it with attribute-based access control — RBAC is sufficient and much simpler to audit.

---

## Remediation Priority

| Priority | Finding | Effort | Timeline |
|---|---|---|---|
| 1 | Session management (F1) | Medium — auth config + middleware | Before staging deployment |
| 2 | Anonymization rigor (F2) | High — DB views + HMAC + k-anonymity | Before research view goes live |
| 3 | Read replica credentials (F3) | Low — SQL role creation | Before any DB connection |
| 4 | Audit log tamper protection (F4) | Low — PostgreSQL trigger | Before launch |
| 5 | Rate limiting (F5) | Low — middleware addition | Before launch |
| 6 | Security headers (F6) | Low — next.config.js | Before launch |

---

## Sign-Off Conditions

I will sign off on the code for production deployment when:

- [ ] Session management implements 8-hour hard expiry + 30-minute idle timeout
- [ ] Anonymization uses HMAC-SHA256 with externalized salt
- [ ] K-anonymity suppression (k≥5) is enforced on all demographic queries
- [ ] Database role is read-only with explicit write denial
- [ ] Audit log has append-only trigger protection
- [ ] Rate limiting is active on all API routes
- [ ] Security headers are configured in next.config.js
- [ ] No secrets in codebase (verified via secret scanning)
- [ ] Export watermarking includes user ID and timestamp
- [ ] Incident response runbook exists for dashboard compromise scenarios

*Code review will be conducted against these criteria before delivery.*
