# Content Strategy — Whistle Internal Dashboard

**Date:** 2026-03-20 | **Version:** 1.0

---

## Messaging Framework

**Value proposition:** The Whistle internal dashboard gives the NetRef Safety team a single place to confirm the pipeline is healthy, clients are getting value, and the abuse dataset is building the evidence base for athlete protection.

**Tone parameters:**
- Funny ↔ **Serious** (this is 90% serious — we're monitoring hate speech detection)
- Formal ↔ **Casual-professional** (60% toward casual — this is an internal tool for a small team, not a client-facing product)
- **Respectful** ↔ Irreverent (fully respectful — the data involves real harm to real people)
- Enthusiastic ↔ **Matter-of-fact** (80% matter-of-fact — ops dashboards should state facts, not celebrate them)

**Voice summary:** Direct, calm, and actionable. Like a well-written incident report — it tells you what's happening, whether it's a problem, and what to do about it. No marketing language. No jargon unless the term is universally understood by the team.

---

## Navigation Labels

| Location | Label | Rationale |
|---|---|---|
| Top nav item 1 | **Operations** | Clear noun; covers all pipeline/ops monitoring |
| Top nav item 2 | **Metrics** | Broader than "Analytics" — covers product, customer, and business metrics |
| Top nav item 3 | **Research** | Direct; signals this is the anonymized research dataset section |
| Top nav item 4 | **Cases** | Short for "Case Lookup"; familiar to anyone in client success or safety |

### Operations Sub-Navigation

| Label | Not This | Why |
|---|---|---|
| Health Summary | Overview / Dashboard | "Health" is the operative word — it's a health check, not a general overview |
| Pipeline | Data Pipeline / Ingestion | The team calls it "the pipeline" — match their language |
| Detection | Detection Quality / AI Performance | "Detection" is simpler; "quality" is implied by the metrics shown |
| Platforms | Platform Status / Integrations | "Platforms" matches how the team talks about X, YouTube, Instagram |
| Costs | Cost Monitor / Financials | Short and clear |
| Clients | Client Activity / Engagement | "Clients" is the simplest noun; activity is implied by the metrics |

### Metrics Sub-Navigation

| Label | Not This | Why |
|---|---|---|
| North Star | Key Metrics / KPIs | "North Star" is the actual term used in the metrics brief — the team knows it |
| Usage | Product Usage / Adoption | "Usage" alone is sufficient |
| Customers | Customer Health / Client Health | "Customers" in the metrics context (vs. "Clients" in ops context) follows the brief's language |
| Business | Business Metrics / Revenue | "Business" covers ARR, contracts, and NPS without being overly specific |
| Investor View | Investor Snapshot / Board Deck | "Investor View" clearly signals this is the exportable format for external audiences |

---

## Status Copy

The most important copy in the dashboard is the status language. Every metric has three states. The copy needs to be instantly readable and actionable.

### Status Labels

| State | Label | Color | Icon |
|---|---|---|---|
| Healthy | **Healthy** | Green (#22C55E) | Filled circle |
| Warning | **Needs attention** | Amber (#F59E0B) | Warning triangle |
| Critical | **Critical** | Red (#EF4444) | Filled alert circle |

**Not "OK" / "Warning" / "Error":** Those are system words. "Healthy" and "Needs attention" are human words. "Critical" is appropriately alarming for the critical state.

### Status Descriptions (shown in detail views)

| Metric | Healthy Copy | Warning Copy | Critical Copy |
|---|---|---|---|
| Posts Ingested | "Ingestion volume is within normal range" | "Ingestion volume is lower than expected — investigate today" | "Zero ingestion detected from one or more platforms — triage immediately" |
| Classifier Success | "Classifier is running normally" | "Classifier success rate has dropped — check error logs" | "Classifier failure rate is above safe threshold — pipeline reliability at risk" |
| FP Checker | "False positive checker is running normally" | "FP checker success rate has dropped — review recent errors" | "FP checker is failing at an elevated rate — detection quality at risk" |
| Action Agent | "Action agent is processing incidents normally" | "Action agent success rate has dropped — check Supabase and webhooks" | "Action agent is failing — client alerts may not be delivered" |
| Latency P50/P95 | "Pipeline latency is within target" | "Pipeline latency is elevated — monitor for further degradation" | "Pipeline latency is severely degraded — real-time detection compromised" |
| Queue Depth | "Queue depth is normal" | "Queue is backing up — classifier may be falling behind" | "Queue is critically backed up — posts are not being processed in time" |
| Detection Rate | "Detection rate is within expected range" | "Detection rate has shifted significantly — verify classifier behavior" | "No detections in over 6 hours despite normal ingestion — classifier may be broken" |
| False Positive Rate | "Client-reported false positive rate is within target" | "False positive rate is elevated — review flagged incidents for patterns" | "False positive rate is critically high — clients are losing trust in alerts" |

---

## Empty States

Every section needs an empty state for when there's no data yet (early days of operation).

| Section | Empty State Heading | Body Copy | Action |
|---|---|---|---|
| Health Summary | "Waiting for first data" | "Health metrics will appear here once the pipeline has been running for at least 24 hours." | None — informational |
| Detection Quality | "Not enough data yet" | "Detection quality metrics need at least 7 days of data to show meaningful trends. Check back after [date]." | None — informational |
| Client Activity | "No clients onboarded yet" | "Client activity will appear here once your first client is connected and monitoring athletes." | None — informational |
| Research Demographics | "Demographic data collection in progress" | "Disparity analysis requires athlete demographic data with explicit consent. Contact your team lead about the consent collection process." | None — informational |
| Case Lookup (no results) | "No matching incidents" | "Try adjusting your search filters or broadening the date range." | "Clear filters" button |
| Exports (none yet) | "No exports yet" | "When you export research data, it will appear here with a record of what was exported and when." | None — informational |

---

## Error Messages

| Error | Copy | Rationale |
|---|---|---|
| Auth failure | "We couldn't verify your identity. Try signing in with Google again." | Doesn't blame the user; suggests a clear action |
| Unauthorized view | "You don't have access to this section. Contact your admin if you need it." | States the fact and provides a path forward |
| Database timeout | "This query is taking longer than expected. Try a shorter date range or fewer filters." | Tells the user what happened and what to try |
| Export too large | "This export has too many records. Narrow your filters to under 50,000 records." | Gives a concrete limit they can work toward |
| Session expired | "Your session has expired. Sign in again to continue." | No drama; clear action |
| Stale data | "Data may be delayed. Last updated [time]." | Honest about the situation without being alarming |
| Replica unavailable | "Live data is temporarily unavailable. Showing cached data from [time]." | Transparent about fallback behavior |

---

## Tooltips & Help Text

For non-technical users, several metrics need brief explanations. These appear as (?) icons next to metric labels.

| Metric | Tooltip |
|---|---|
| Classifier Success Rate | "The percentage of ingested posts that were successfully analyzed by the AI classifier without errors." |
| FP Checker Success Rate | "The percentage of flagged posts that were successfully reviewed by the false-positive checker." |
| P50 / P95 Latency | "P50 is the median processing time (half of posts are faster). P95 is the time that 95% of posts are processed within." |
| False Positive Rate | "The percentage of alerts that clients marked as incorrect. Lower is better." |
| Detection Rate (Normalized) | "Number of harmful posts detected per 1,000 posts scanned. Removes volume effects so you can compare across time periods." |
| K-Anonymity Suppression | "When fewer than 5 athletes share a demographic characteristic, their data is hidden to prevent identification." |
| Queue Depth | "The number of posts waiting to be analyzed. Higher numbers mean the system is falling behind." |
| North Star Metric | "The total number of harmful incidents detected AND acted on by clients. This is the single most important number." |

---

## Content Warnings (for Abuse Content)

When displaying full text of abusive posts (Case Lookup, Detection Quality review):

**Pre-reveal warning:**
> "This incident contains abusive content. Viewing is logged for audit purposes."
> [Reveal content] [Skip]

**Purpose selector (required before reveal):**
> "Why are you viewing this content?"
> ○ Quality review  ○ Client inquiry  ○ Incident investigation

**Post-reveal reminder (subtle, bottom of content area):**
> "If viewing this content is affecting you, step away. Your wellbeing matters. [Employee support resources]"

---

## Terminology Glossary

Consistent terms across the entire dashboard:

| Term | Definition | Don't Use |
|---|---|---|
| Incident | A single flagged abusive post | Alert, flag, detection, hit |
| Athlete | A monitored individual | Player, user, profile, subject |
| Client | An organization that contracts with NetRef Safety | Customer (in ops context), account, team |
| Harm category | One of the 13 types of abuse the classifier detects | Category, type, label, tag |
| Platform | X, YouTube, or Instagram | Channel, source, network |
| Pipeline | The full ingestion → classification → FP check → action flow | System, process, workflow |
| Flagged | Identified by the classifier as potentially harmful | Detected, caught, found |
| Confirmed | Passed the FP checker as a true positive | Verified, validated |
| Dismissed | Marked by a client admin as incorrect | Overridden, rejected, false positive |

---

*Use this document as the single source of truth for all user-facing text in the dashboard. Every label, message, and tooltip should match these specifications.*
