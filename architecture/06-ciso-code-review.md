# CISO Code Review — Whistle Internal Dashboard Frontend

**Classification:** Internal — Confidential
**Reviewer:** CISO | **Date:** 2026-03-20 | **Version:** 1.0
**File Reviewed:** whistle-dashboard.jsx
**Overall Verdict:** APPROVED FOR PROTOTYPE / STAGING USE. This is a well-structured frontend prototype with mock data. No production data or real authentication is in play yet — so the risk surface is limited to the prototype stage. I found 0 Critical issues, 1 High issue (for production readiness), and 3 Medium items to address before this touches real data.

---

## What's Done Well

1. **No hardcoded secrets or API keys.** The prototype uses entirely mock data with no Supabase connection strings, API keys, or credentials anywhere in the code. This is exactly right for a prototype — credentials belong in environment variables, not source code.

2. **Content warning implementation matches CPO requirements.** The Case Lookup view implements the blur-by-default pattern with a content warning gate before revealing abuse text. The warning includes audit language ("Viewing is logged for audit purposes") and a wellbeing message after reveal. This directly implements CPO Finding 2 and Finding 6.

3. **Role-based navigation filtering.** The sidebar navigation filters visible sections based on the user's role. The `isAllowed()` function correctly restricts what each role can see, matching the RBAC matrix from the architecture document. The research role only sees Research and Cases — good.

4. **Anonymized identifiers in research view.** The research demographics view shows "Athlete #A7F2" style identifiers rather than real names, displays the "Anonymized view" badge with a lock icon, and includes an export button (which in production will require the data use acknowledgment). This matches both CISO Finding 2 and CPO requirements.

5. **No localStorage or sessionStorage usage.** All state is managed via React hooks (useState). This avoids a common vulnerability where sensitive data persists in browser storage after logout.

---

## Findings

### Finding 1 — Role Enforcement is Client-Side Only (Production Blocker)

**Severity:** HIGH (for production deployment — not relevant for prototype stage)
**CWE:** CWE-602 (Client-Side Enforcement of Server-Side Security)

**The issue:** The role-based access control in this prototype is enforced via a `<select>` dropdown and a client-side `isAllowed()` function. Any user can switch to "Leadership" role in the dropdown and see everything. This is acceptable for a demo prototype but is a stop-the-line issue before connecting to real data.

**What must be true before production:**
- Role must come from the server session (Supabase Auth user metadata or the `user_roles` table), not from client state
- The middleware.ts file must validate the role server-side on every API request
- API routes must independently verify the user's role — never trust the client's claim of what role they are
- The role selector dropdown should be removed or converted to a read-only display of the user's actual role

**CISO sign-off condition:** This finding is acceptable for the current prototype stage. It must be resolved before any real data (even from a read replica) is connected.

### Finding 2 — Export Button Needs Server-Side Gating

**Severity:** MEDIUM

The "Export as PDF" and "Export" buttons are present in the UI but currently non-functional (prototype stage). When these are wired up:
- Exports must be generated server-side via API routes, not client-side
- The export API route must verify the user's role and log the export to the audit table
- Research exports must enforce the data use acknowledgment before the first export (CPO Finding 5)
- Export responses should include the user's ID and timestamp as metadata (watermarking requirement from CISO Finding 2)

### Finding 3 — Content Warning Purpose Selector Not Yet Implemented

**Severity:** MEDIUM

The content warning in Case Lookup shows "Reveal content" and "Skip" buttons, but the CPO requirement includes a purpose selector ("Why are you viewing this content?" with options: Quality review, Client inquiry, Incident investigation). This should be added before the Case Lookup view connects to real incident data, as the purpose selection feeds into the audit log.

### Finding 4 — Session Timeout UI Placeholder Needed

**Severity:** MEDIUM

The UX spec calls for a 30-minute idle timeout with a "Session expiring" toast. The prototype doesn't implement this yet. For production:
- Add an idle timer that shows a toast at 25 minutes
- At 30 minutes, clear the session and redirect to login
- The auth middleware should reject expired sessions independently of the client-side timer (defense in depth)

---

## Sign-Off Status

### Prototype / Staging: ✅ APPROVED

This code is safe for:
- Demo purposes with mock data
- Internal review and feedback collection
- UX testing with the team
- Deployment to a Vercel preview URL

### Production with Real Data: ⬜ NOT YET APPROVED

Before connecting to real Supabase data, the following must be implemented:
- [ ] Server-side role enforcement (Finding 1)
- [ ] Session management with 8-hour hard expiry + 30-minute idle (original CISO Finding 1)
- [ ] Security headers in next.config.js (original CISO Finding 6)
- [ ] Rate limiting on API routes (original CISO Finding 5)
- [ ] Audit logging for all data access and exports
- [ ] Content warning purpose selector (Finding 3)
- [ ] Export watermarking and server-side generation (Finding 2)

---

*Signed: CISO Review — 2026-03-20*
*Next review: When server-side authentication and API routes are implemented*
