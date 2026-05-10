# Privacy Impact Assessment — Whistle Internal Dashboard

**Classification:** Internal — Confidential
**Reviewer:** CPO | **Date:** 2026-03-20 | **Version:** 1.0
**Documents Reviewed:** System Architecture, CISO Security Review, Daily Health Check Spec, Metrics Brief, Research Metrics Brief
**Overall Assessment:** This dashboard handles some of the most sensitive categories of personal data imaginable — abuse content directed at named athletes, cross-referenced with their race, gender, LGBTQ status, and disability status. The architecture makes several strong privacy-by-design choices, but there are critical gaps in the data lifecycle that need to be closed before this system goes live. The biggest thing I want to talk about is the research analytics module and the tension between "research-grade data" and "athlete protection."

---

## The Core Privacy Tension

Whistle exists to protect athletes from online abuse. The internal dashboard exists to help the team do that effectively and to build a publishable research dataset about abuse patterns. Here's the tension: the better the research data, the more re-identifiable the athletes become. A dataset that says "a Black woman in college volleyball received 47 incidents of racial abuse after a nationally televised loss" is extremely publishable — and it describes exactly one person.

Every privacy decision in this dashboard needs to be evaluated through this lens: **does this data handling choice protect the athletes we're serving, or does it create a new vector for them to be identified, profiled, or harmed?**

---

## Data Classification

Before anything else, let's classify what this dashboard touches. This determines everything downstream.

| Data Category | Privacy Classification | Examples | Regulatory Triggers |
|---|---|---|---|
| **Athlete identity** | HIGH — PII | Real names, social media handles, profile photos | GDPR Art. 9 (if linked to special categories), state privacy laws |
| **Athlete demographics** | CRITICAL — Special category | Race/ethnicity, LGBTQ status, disability status, gender | GDPR Art. 9 (explicit consent required), potential BIPA implications |
| **Abuse content** | HIGH — Sensitive | Text of abusive posts, harm category classifications, severity scores | Content could itself contain hate speech, threats; handling creates liability |
| **Client business data** | MEDIUM — Commercial | Client names, contract values, ARR, plan tiers | Commercial confidentiality; NDA obligations |
| **Pipeline operational data** | LOW — Technical | Job success rates, latency, queue depth, API costs | No personal data; internal operational metrics |
| **Dashboard user data** | LOW — Internal | Employee names, email addresses, role assignments, login timestamps | Standard employee data; minimal privacy concern |

**The critical insight:** This dashboard doesn't just display data *about* athletes — it displays data about *abuse directed at* athletes, linked to their demographic identities. This makes it one of the most privacy-sensitive internal tools I've reviewed. A leak doesn't just expose PII — it could expose that a specific athlete was targeted with specific types of abuse, which could itself cause harm (re-traumatization, media exposure, stigmatization).

---

## Findings

### Finding 1 — Athlete Consent Model for Demographic Data is Undefined

**Severity:** CRITICAL
**Affected Area:** Research Analytics, Data Collection

**The problem:** The research metrics spec calls for logging athlete race/ethnicity, LGBTQ status, and disability status. It correctly notes these should be "opt-in" and "self-identified only." But the architecture doesn't define *how* this consent is obtained, *where* it's recorded, *how* athletes can withdraw it, or *what happens to existing research data* when consent is withdrawn.

This isn't a technical problem — it's a program design gap. Under GDPR Article 9, processing special category data requires explicit consent that is: informed (the athlete understands their demographic data will be used in research on abuse patterns), specific (consent to research use, not a blanket "use my data however"), freely given (the athlete can decline without losing Whistle's protection), and withdrawable (they can change their mind, and you can actually honor that).

**What needs to exist before the research module goes live:**

1. **Consent flow specification:** How does an athlete (or their representative) consent to demographic data collection? Is it in the client's onboarding? A separate form? Does the client consent on behalf of athletes, or does each athlete consent individually? The answer matters enormously for GDPR validity.

2. **Consent record:** A `demographic_consent` table that records: who consented, when, what they consented to (which specific fields), the version of the consent language they saw, and whether consent was given by the athlete directly or by their representative.

3. **Withdrawal mechanism:** If an athlete withdraws consent, their demographic data must be removed from the research dataset within 30 days. Pre-computed monthly aggregates that included their data must be either recomputed or retained only if the k-anonymity threshold (k≥5) still holds without them.

4. **Default state:** If consent hasn't been explicitly obtained, the demographic fields must be null in the research dataset. Never infer demographic data from names, photos, or social media profiles. The research spec says this — make it a hard technical constraint, not just a policy statement.

**Why this matters beyond compliance:** If an athlete's representative learns that Whistle is categorizing their client's race and LGBTQ status in a database — even for research purposes — without explicit consent, that's not just a regulatory problem. It's a relationship-destroying trust violation with the exact population you're trying to protect.

---

### Finding 2 — Abuse Content Display Needs Purpose Limitation

**Severity:** HIGH
**Affected Area:** Case Lookup View

**The problem:** The Case Lookup view allows searching for individual incidents and viewing details. For ops and leadership roles, this presumably includes the text of the abusive post itself. This is necessary for quality review (is the classifier working correctly?) but it means the dashboard becomes a repository of hate speech, threats, and slurs that internal employees can browse.

**Requirements:**

1. **Access logging for content views:** Every time someone views the full text of an abusive post, log it. Not just "user accessed the case lookup page" but "user viewed incident #12345 which contains the full text of an abusive post directed at athlete X." This creates accountability.

2. **Purpose limitation in the UI:** The Case Lookup view should require selecting a reason before viewing full content: "Quality review," "Client inquiry," "Incident investigation." This isn't foolproof, but it creates a paper trail and signals to employees that this access is monitored and purposeful.

3. **Content redaction for non-essential roles:** The client_success role should see the harm category, severity score, and platform — but not the full text of abuse. They need to answer "yes, we flagged 3 incidents on X yesterday for your athlete" — they don't need to read the abuse itself. This is both a privacy measure and an employee wellbeing measure.

4. **Research role sees no content:** The research role should never see raw abuse text. They see categories, scores, timestamps, and demographics — never the words themselves. This prevents the research export from becoming a collection of hate speech.

---

### Finding 3 — Data Retention Policy is Missing

**Severity:** HIGH
**Affected Area:** All dashboard data

**The problem:** The architecture has no data retention policy. How long is incident data kept? How long are audit logs retained? When are monthly aggregates archived? The research spec mentions 3-5 years of data retention as valuable — but that means 3-5 years of athlete PII, abuse content, and demographic data that must be protected, subject to access requests, and eventually deleted.

**What needs to be defined:**

| Data Type | Retention Period | Justification | Deletion Method |
|---|---|---|---|
| Raw incident data (with PII) | 2 years from detection | Sufficient for quality review, client inquiries, and trend analysis | Automated deletion job; cascade to all linked records |
| Anonymized research aggregates | 5 years | Supports longitudinal research publications | No deletion needed (no PII if anonymization is correct) |
| Audit logs | 3 years | SOC 2 requirement + regulatory defense | Automated archival after 1 year; deletion after 3 |
| Dashboard user sessions | 90 days | Troubleshooting and security review | Automated deletion |
| Exported files | 30 days on server | Exports should be downloaded promptly; not stored indefinitely | Automated cleanup of export cache |

**The key insight:** Raw incident data has a shelf life. After 2 years, its value for quality review diminishes significantly — but its liability as retained PII does not. Convert it to anonymized aggregates before deletion so the research value is preserved without the privacy risk.

---

### Finding 4 — Cross-Role Data Leakage via Caching

**Severity:** MEDIUM
**Affected Area:** Server-Side Cache

**The problem:** The architecture uses server-side caching with TTLs per metric type. But it doesn't specify whether the cache is role-aware. If a leadership user fetches the full incident detail (including athlete names) and it's cached, and a research user then requests the same endpoint, does the cache serve the un-anonymized version?

**Requirement:** Cache keys must include the user's role. A cache entry created by a leadership request must never be served to a research request. The simplest approach: prefix every cache key with the role.

```
cache_key = `${role}:${endpoint}:${params_hash}`
```

This is a subtle bug that's easy to introduce and hard to detect — a test that passes because both test users have the same role won't catch it.

---

### Finding 5 — Export Controls for Research Data

**Severity:** MEDIUM
**Affected Area:** Research Export Service

**The problem:** The research team needs to export data for academic publications. But once data leaves the dashboard as a CSV, the dashboard's access controls no longer apply. The exported file could be shared with anyone.

**Requirements:**

1. **Export approval workflow:** Research exports above a certain size (e.g., >1000 records or any export containing demographic breakdowns) should require approval from a leadership user before the download completes. This adds friction by design.

2. **Export manifest:** Every export generates a record in the audit log: who exported, what query parameters, how many records, which fields, the file hash. If data appears somewhere it shouldn't, you can trace it to a specific export.

3. **Terms-of-use acknowledgment:** Before their first export, the research user must acknowledge a data use agreement (displayed in-app, recorded with timestamp) that covers: data must not be shared outside the organization without approval, re-identification attempts are prohibited, and data must be securely deleted after the research use is complete.

4. **No raw IDs in exports:** Even the anonymized `athlete_id_anon` should use a different hash salt for exports than for internal dashboard display. This prevents someone from correlating an exported dataset with a live dashboard lookup.

---

### Finding 6 — Employee Wellbeing: Content Exposure

**Severity:** MEDIUM
**Affected Area:** Case Lookup, Ops Detection Quality Views

**The problem:** This is a privacy-adjacent concern but important: employees viewing the dashboard will be exposed to abusive content — racial slurs, threats, sexual harassment, homophobia directed at athletes. Over time, this exposure has documented psychological effects on content moderators.

**Recommendations:**

1. **Content warnings:** Before displaying full abuse text, show a content warning that the user must click through. Not a legal requirement — a care requirement.

2. **Blur-by-default for abuse text:** Show the harm category, severity score, and metadata by default. The actual text is blurred and requires a deliberate click to reveal. This prevents accidental exposure during routine dashboard checks.

3. **Access monitoring for wellbeing:** If an employee is viewing hundreds of full-text abuse posts per week, flag it. Not as a compliance issue — as a manager awareness signal.

---

## What's Done Well

1. **The anonymization-at-query-layer decision.** This is the right approach. Most teams try to anonymize in the UI and leave PII in the API layer — which means it's one browser extension away from being visible. Enforcing anonymization in the query layer (and the CISO's recommendation to use PostgreSQL views) means the data is never in identifiable form for the research role at any point in the stack.

2. **The separate read replica.** Beyond the security benefits, this has a privacy benefit: the dashboard never has write access to athlete data. You cannot accidentally modify, corrupt, or delete an athlete's record through the dashboard. This is a strong data integrity safeguard.

3. **The research spec's ethics framework.** The research metrics document explicitly calls out IRB review, differential privacy, opt-in for sensitive demographics, and platform TOS compliance. These are exactly the right things to be thinking about pre-launch, not post-publication.

4. **Role-based view restrictions.** The RBAC model means the client success team doesn't see research demographics, the ops team doesn't see business financials, and the research team doesn't see operational data. This is need-to-know access implemented correctly.

---

## Regulatory Considerations

Given the data types involved, here are the regulations most likely to apply:

| Regulation | Relevance | Key Obligation |
|---|---|---|
| **GDPR** | High — if monitoring athletes in EU/UK or if EU clients | Lawful basis for processing special category data (Art. 9); DPIA required for systematic monitoring (Art. 35); data subject access rights |
| **US State Privacy Laws (CCPA/CPRA, etc.)** | High — if athletes or clients are in CA, CO, CT, VA, etc. | Right to know, right to delete; "sensitive personal information" includes race, sexual orientation |
| **Title IX** | Contextual — if college athletes | Abuse data linked to student athletes may intersect with Title IX reporting obligations |
| **FERPA** | Contextual — if monitoring college athletes through university contracts | Education records protection; university clients may have FERPA constraints on data sharing |
| **IRB Requirements** | High — for any academic publication | Research involving human subjects (even observational analysis of anonymized data) typically requires IRB review |

**Recommendation:** Before the research module goes live, engage privacy counsel to confirm the lawful basis for processing athlete demographic data across applicable jurisdictions. This is one area where regulatory advice — not just privacy design — is needed.

---

## Summary of Required Actions

| Priority | Finding | Action | Owner | Timeline |
|---|---|---|---|---|
| 1 | Consent model (F1) | Design and implement athlete consent flow for demographic data | Product + Legal | Before research module |
| 2 | Content purpose limitation (F2) | Add content redaction by role + access logging for content views | Engineering | Before launch |
| 3 | Data retention policy (F3) | Define and implement retention periods + automated deletion | Engineering + Legal | Before launch |
| 4 | Cache role isolation (F4) | Add role to cache keys | Engineering | Before launch |
| 5 | Export controls (F5) | Implement approval workflow + export manifest + data use agreement | Engineering + Legal | Before research exports |
| 6 | Employee wellbeing (F6) | Add content warnings + blur-by-default for abuse text | Design + Engineering | Before launch |

---

*This assessment should be reviewed alongside the CISO Security Review (02-ciso-security-review.md). The CISO's findings on anonymization rigor (HMAC-SHA256, k-anonymity) and audit log protection are complementary to the privacy findings above and should be implemented together.*
