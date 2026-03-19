# Implementation Plan: Allowlist & Blocked Users List

## Overview

This plan covers two new Whistle features:

1. **Allowlist** — A per-athlete list of social media users whose content Whistle should never moderate or take action on (e.g., trusted friends, family, teammates, verified journalists).
2. **Blocked Users List** — A dashboard view showing all users that have been blocked on the platform as a result of Whistle's moderation, with the ability to manage that list.

Both features touch the database, the polling/orchestration layer, the API, and the frontend dashboard.

---

## Feature 1: Allowlist

### What it does (non-technical)

The allowlist is a "safe senders" list. When a player adds someone to the allowlist, Whistle will completely skip its AI moderation pipeline for any content from that person. Their tweets, comments, and DMs pass through untouched. This prevents false positives on people the player trusts — a teammate trash-talking in a friendly way, a family member, an agent, etc.

Players manage their own allowlist. They can add accounts individually, or upload a CSV file to bulk-import a list (e.g., a team roster). The allowlist is capped at 500 manual entries per player.

In addition to manually-added entries, **any account the player follows on a platform is implicitly allowlisted.** If a player follows Samantha on Twitter, nothing Samantha comments or messages should be flagged. This "followed = safe" rule is automatic and doesn't count toward the 500-entry cap.

Whistle does **not** notify the player when content from an allowlisted user would have been flagged. The allowlist is a hard pass — content from these accounts is simply skipped.

### What it does (technical)

Two layers of allowlisting work together:

1. **Explicit allowlist** — A new `allowlisted_authors` table stores platform-specific user IDs tied to each Whistle user (capped at 500 entries). Players manage this via the UI or CSV upload.
2. **Implicit allowlist (followed accounts)** — At the start of each poll cycle, Whistle fetches the player's follow/following list from each connected platform and caches it in memory. Any content author on that list is treated identically to an explicit allowlist entry.

During the polling loop, after a content item is ingested but *before* the 3-stage AI pipeline runs, we check both layers. If the content's author matches either one, we skip the pipeline entirely, log a "skipped — allowlisted" record for auditability, and move on.

---

### Database Changes

**New migration: `004_allowlist_and_blocked_users.sql`**

```sql
-- Allowlisted authors: content from these users skips the moderation pipeline
CREATE TABLE allowlisted_authors (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform           TEXT NOT NULL CHECK (platform IN ('twitter', 'instagram')),
  platform_user_id   TEXT,           -- platform's numeric/internal ID (preferred for matching)
  platform_username  TEXT NOT NULL,   -- human-readable handle (for display)
  note               TEXT,            -- optional reason, e.g. "teammate", "agent"
  added_by           TEXT,            -- who added this entry (email or name)
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform, platform_username)
);

CREATE INDEX idx_allowlisted_authors_lookup
  ON allowlisted_authors(user_id, platform, platform_user_id);

CREATE INDEX idx_allowlisted_authors_handle
  ON allowlisted_authors(user_id, platform, platform_username);

-- RLS: users can only see/manage their own allowlist
ALTER TABLE allowlisted_authors ENABLE ROW LEVEL SECURITY;

CREATE POLICY allowlisted_authors_user_policy ON allowlisted_authors
  USING (user_id = auth.uid());
```

**Why two lookup columns?** Twitter provides a stable numeric `author_id` on every mention, so we can match on `platform_user_id`. Instagram comments sometimes only include a username, so we fall back to `platform_username`. Having both lets us match reliably on either platform.

**Enforcing the 500-entry cap:** Add a check constraint or application-level validation. Since Postgres doesn't natively support row-count constraints per user, enforce this at the API layer before INSERT, and add a database trigger as a safety net:

```sql
-- Safety trigger to enforce 500-entry cap per user
CREATE OR REPLACE FUNCTION check_allowlist_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM allowlisted_authors WHERE user_id = NEW.user_id) >= 500 THEN
    RAISE EXCEPTION 'Allowlist limit of 500 entries reached for this user';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_allowlist_limit
  BEFORE INSERT ON allowlisted_authors
  FOR EACH ROW EXECUTE FUNCTION check_allowlist_limit();
```

---

### Backend Changes

#### 1. Followed accounts fetch (implicit allowlist)

**File:** `lib/allowlist/followed-accounts.ts` (new file)

At the start of each poll cycle, before processing any content items, fetch the player's followed accounts from each connected platform and hold them in a `Set` for fast O(1) lookups.

**Twitter:** `GET /2/users/{id}/following` (paginated, max 1000 per page, 15 requests per 15 minutes)

```typescript
export async function fetchFollowedAccounts(
  platform: string,
  accessToken: string,
  platformUserId: string
): Promise<Set<string>> {
  const followedIds = new Set<string>();

  if (platform === "twitter") {
    let paginationToken: string | undefined;
    do {
      const url = new URL(`https://api.twitter.com/2/users/${platformUserId}/following`);
      url.searchParams.set("max_results", "1000");
      if (paginationToken) url.searchParams.set("pagination_token", paginationToken);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json();

      for (const user of json.data ?? []) {
        followedIds.add(user.id);           // numeric ID
        followedIds.add(user.username);      // handle (for fallback matching)
      }
      paginationToken = json.meta?.next_token;
    } while (paginationToken);
  }

  if (platform === "instagram") {
    // Instagram Business API does not expose a "following" list endpoint.
    // Workaround: use the player's own follower/following count as a signal,
    // but we cannot get the actual list. This is an Instagram API limitation.
    // For Instagram, only explicit allowlist entries apply.
    console.warn("[allowlist] Instagram does not support fetching followed accounts via API");
  }

  return followedIds;
}
```

**Important Instagram limitation:** The Instagram Graph API does not provide an endpoint to list accounts a user follows. The implicit "followed = safe" rule only works on Twitter. For Instagram, players need to use the explicit allowlist. This limitation should be clearly communicated in the UI.

**Caching strategy:** The followed-accounts `Set` is fetched once per poll cycle and passed through to `processContentItem()`. This avoids repeated API calls during a single poll. The set is not persisted to the database — it's rebuilt each cycle to stay current (the player may follow/unfollow people between polls).

**Rate limit consideration:** Twitter allows 15 following-list requests per 15-minute window. For players following fewer than 1000 accounts (most athletes), this is a single request. For players following up to 15,000, this takes up to 15 paginated requests — still within the rate limit for a single poll cycle. If a player follows more than 15,000 accounts, we'd need to cache the list and refresh incrementally, but this is unlikely for the target user base.

#### 2. Allowlist check in the polling loop

**File:** `lib/polling/poller.ts` — `processContentItem()`

Insert a check after the content item is saved to `content_items` (around line 220) and before `runPipeline()` is called (line 222). The function now receives both the explicit allowlist and the followed-accounts set:

```typescript
// Check if author is on the explicit allowlist OR in followed accounts
const isAllowlisted = await checkExplicitAllowlist(userId, platform, authorId, authorHandle);
const isFollowed = followedAccountsSet.has(authorId) || followedAccountsSet.has(authorHandle);

if (isAllowlisted || isFollowed) {
  const reason = isAllowlisted ? "author_allowlisted" : "author_followed";

  // Log a pipeline_run with risk_level "skipped" for audit trail
  await db.from("pipeline_runs").insert({
    content_item_id: contentItemId,
    user_id: userId,
    risk_level: "skipped",
    classifier_output: { reason, author: authorHandle },
    action_agent_output: { content_action: "none", account_action: "none" },
    created_at: new Date().toISOString(),
  });

  // Log to audit_log
  await db.from("audit_log").insert({
    user_id: userId,
    pipeline_run_id: pipelineRunId,
    action: "skip_allowlisted",
    detail: `Skipped moderation: ${authorHandle} is ${reason === "author_followed" ? "followed by player" : "on allowlist"}`,
    created_at: new Date().toISOString(),
  });

  return; // Skip pipeline and platform actions entirely
}
```

#### 3. New helper: `lib/allowlist/check.ts`

```typescript
export async function checkExplicitAllowlist(
  userId: string,
  platform: string,
  platformUserId: string | null,
  platformUsername: string | null
): Promise<boolean> {
  // Try matching on platform_user_id first (more reliable), then username
  const { data } = await db
    .from("allowlisted_authors")
    .select("id")
    .eq("user_id", userId)
    .eq("platform", platform)
    .or(
      `platform_user_id.eq.${platformUserId},platform_username.eq.${platformUsername}`
    )
    .limit(1);

  return (data?.length ?? 0) > 0;
}
```

**Performance optimization:** At the start of each poll cycle, load the entire explicit allowlist into a `Set` alongside the followed-accounts set. This turns what would be one DB query per content item into one DB query per user per poll cycle:

```typescript
// At poll cycle start, load both sets
const explicitAllowlist = await loadExplicitAllowlistSet(userId, platform);
const followedAccounts = await fetchFollowedAccounts(platform, accessToken, platformUserId);

// Merge into one lookup set for simplicity
const fullAllowlistSet = new Set([...explicitAllowlist, ...followedAccounts]);

// Then in processContentItem, a simple set check replaces the DB query:
const isAllowlisted = fullAllowlistSet.has(authorId) || fullAllowlistSet.has(authorHandle);
```

---

### API Endpoints

**New route: `app/api/allowlist/route.ts`**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/allowlist` | List all allowlisted authors for the current user. Response includes `count` and `limit` (500) so the UI can show remaining capacity. |
| `POST` | `/api/allowlist` | Add a single author to the allowlist. Returns `409` if at 500-entry cap. |
| `DELETE` | `/api/allowlist/[id]` | Remove an author from the allowlist. |
| `POST` | `/api/allowlist/import` | Bulk import from CSV upload. |

**POST body (single add):**
```json
{
  "platform": "twitter",
  "platform_username": "@teammate_joe",
  "platform_user_id": "123456789",
  "note": "Teammate - friendly banter"
}
```

**POST body (CSV import) — `multipart/form-data`:**

The CSV file should have columns: `platform`, `username`, and optionally `note`. Example:

```csv
platform,username,note
twitter,@teammate_joe,Teammate
twitter,@coach_smith,Coaching staff
instagram,samantha_jones,Family
```

The import endpoint:
1. Parses the CSV and validates each row (platform must be `twitter` or `instagram`, username is required).
2. Checks how many entries the player already has. If the import would exceed 500, it rejects the entire batch with a clear error: "Import would add {n} entries, but you only have {remaining} slots available (500 max)."
3. Inserts valid rows in a single batch transaction.
4. Returns a summary: `{ imported: 45, skipped_duplicates: 3, errors: [] }`.

**Auth:** All endpoints require a valid session (same pattern as existing `/api/poll/route.ts`). RLS ensures users can only access their own allowlist entries.

---

### Frontend Changes

**File:** `app/settings/page.tsx` — New "Allowlist" section

Add a new tab or section to the settings page:

- **Header** showing count and cap: "23 of 500 entries used" with a progress bar
- **Table view** showing all explicitly allowlisted authors (username, platform icon, note, date added)
- **Add form** with fields: platform dropdown, username input, optional note
- **CSV upload button** that accepts `.csv` files, shows a preview of what will be imported, and confirms before submitting
- **Remove button** per row with confirmation dialog
- **Search/filter** by platform or username
- **Info banner** explaining: "Accounts you follow on Twitter are automatically protected from moderation. You don't need to add them here. This list is for additional accounts you want to protect. Note: Instagram does not support automatic follow detection — add Instagram accounts here manually."
- **Empty state** explaining what the allowlist does and prompting the player to add their first entry or upload a CSV

**File:** `app/feed/page.tsx` — Quick-add from feed

- Add a context menu or action button on content items: "Add author to allowlist"
- Show a small badge/indicator on content items from allowlisted authors (if any somehow appear)

---

### Edge Cases to Handle

1. **Author changes username:** If we stored only the username and the person changes their handle, we lose the match. This is why we store `platform_user_id` when available. For Instagram where we may only have usernames, note this limitation in the UI.
2. **CSV validation errors:** Malformed CSVs (wrong columns, missing usernames, invalid platform names) should produce clear per-row error messages. Never partially import — either the whole batch succeeds or the player sees what needs fixing.
3. **Already-moderated content:** Adding someone to the allowlist doesn't retroactively undo past moderation actions. The UI should note: "Future content from this account won't be moderated. Past actions are not affected."
4. **DMs:** The allowlist should also apply to DM content from `dm_conversations`. If the sender is allowlisted or followed, mark their conversation as "known" automatically.
5. **Player unfollows someone:** Because the followed-accounts list is fetched fresh each poll cycle, unfollowing someone immediately removes their implicit protection. Their next piece of content will go through the normal pipeline. No action needed — this is automatic.
6. **Instagram follow detection gap:** Since Instagram's API doesn't expose who the player follows, there's a platform disparity. Make this clear in the UI so players know to manually add Instagram contacts they trust.

---

## Feature 2: Blocked Users List

### What it does (non-technical)

This is a dashboard view where athletes (or their team) can see everyone Whistle has blocked on their behalf. Think of it like a contact list of people who've been cut off. From this view, they can see *why* someone was blocked, *when* it happened, and — for Twitter — unblock them if the block was a mistake.

### What it does (technical)

Whistle already logs every block action in the `platform_actions` table with `action_type = 'block_sender'`. This feature surfaces that data in the UI, enriches it with context from the associated `pipeline_runs` and `content_items`, and adds an API endpoint to reverse blocks (unblock on Twitter).

---

### Database Changes

No new tables are strictly required — the data already exists in `platform_actions`. However, we should add a column to track unblocks:

```sql
-- Add to migration 004_allowlist_and_blocked_users.sql

ALTER TABLE platform_actions
  ADD COLUMN reversed     BOOLEAN DEFAULT FALSE,
  ADD COLUMN reversed_at  TIMESTAMPTZ,
  ADD COLUMN reversed_by  TEXT;
```

This lets us track when a block was manually reversed without deleting the original audit record.

**Optional index for the blocked users query:**
```sql
CREATE INDEX idx_platform_actions_blocks
  ON platform_actions(action_type, success)
  WHERE action_type = 'block_sender' AND success = TRUE;
```

---

### API Endpoints

**New route: `app/api/blocked-users/route.ts`**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/blocked-users` | List all users blocked by Whistle for the current user |
| `POST` | `/api/blocked-users/[id]/unblock` | Reverse a block (unblock on platform) |

**GET response shape:**
```json
[
  {
    "id": "action-uuid",
    "platform": "twitter",
    "author_id": "123456789",
    "author_handle": "@abusive_user",
    "blocked_at": "2026-03-15T10:30:00Z",
    "reason": "Severe targeted harassment with physical threats",
    "risk_level": "severe",
    "triggering_content": "the original message that caused the block",
    "reversed": false
  }
]
```

**How the GET query works:**

```typescript
// Join platform_actions → pipeline_runs → content_items for full context
const { data } = await db
  .from("platform_actions")
  .select(`
    id, platform, external_author_id, executed_at, reversed, reversed_at,
    pipeline_runs (
      risk_level,
      action_agent_output,
      content_items ( content, author_handle )
    )
  `)
  .eq("action_type", "block_sender")
  .eq("success", true)
  .order("executed_at", { ascending: false });
```

**Unblock endpoint** calls the platform API to reverse the block:

- **Twitter:** `DELETE /2/users/{source_user_id}/blocking/{target_user_id}`
- **Instagram:** Not supported via API (note this in the UI — "Instagram does not support unblocking via API. Please unblock directly in the Instagram app.")

After a successful unblock, update the `platform_actions` row:
```typescript
await db
  .from("platform_actions")
  .update({ reversed: true, reversed_at: new Date().toISOString(), reversed_by: userEmail })
  .eq("id", actionId);
```

---

### Backend Changes

#### 1. New Twitter service function

**File:** `lib/platforms/twitter-fetcher.ts`

```typescript
export async function unblockUser(
  accessToken: string,
  sourceUserId: string,
  targetUserId: string
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(
    `https://api.twitter.com/2/users/${sourceUserId}/blocking/${targetUserId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  // Handle response...
}
```

#### 2. Optional: Sync with platform

Blocks can happen outside Whistle (e.g., the athlete blocks someone directly on Twitter). To show a complete picture, we *could* periodically fetch the full block list from Twitter's API (`GET /2/users/{id}/blocking`). However, this has rate limit implications (15 requests per 15 minutes) and adds complexity.

**Recommendation:** For v1, only show blocks that Whistle initiated. Add a note in the UI: "This list shows users blocked by Whistle. Users you blocked directly on the platform won't appear here." Platform sync can be a fast-follow.

---

### Frontend Changes

**New page: `app/blocked-users/page.tsx`** (or a tab within the existing feed/settings)

- **Table view** with columns: Username, Platform, Blocked Date, Reason/Risk Level, Status (Active / Reversed)
- **Expand row** to see the original content that triggered the block and the full AI reasoning
- **Unblock button** per row (Twitter only) with confirmation dialog: "Are you sure? This person's content will be moderated normally going forward, but they will be able to interact with your posts again."
- **Filter/sort** by platform, date range, active vs. reversed
- **Count badge** in the sidebar navigation showing total active blocks

**UX note on unblocking:** The expectation is that a player would only unblock someone if the original block was a false positive. After unblocking, that person's content goes back through normal moderation. There is no "watch list" or accelerated re-blocking behavior — the system treats them like any other account. The confirmation dialog should simply say: "This will unblock @username on {platform}. Their future content will be moderated normally by Whistle."

---

## Implementation Sequence

### Phase 1: Database & Core Logic (Days 1–2)
1. Write and apply migration `004_allowlist_and_blocked_users.sql` (new table, cap trigger, `platform_actions` columns, indexes)
2. Implement `fetchFollowedAccounts()` for Twitter following-list retrieval
3. Implement `checkExplicitAllowlist()` helper and `loadExplicitAllowlistSet()`
4. Wire combined allowlist check (explicit + followed) into `processContentItem()` in poller.ts
5. Add `unblockUser()` to twitter-fetcher.ts
6. Write unit tests for allowlist matching logic (username vs. ID, explicit vs. followed, cross-platform)

### Phase 2: API Layer (Days 2–3)
1. Build `/api/allowlist` CRUD endpoints (GET, POST, DELETE) with 500-entry cap enforcement
2. Build `/api/allowlist/import` CSV upload endpoint with validation and batch insert
3. Build `/api/blocked-users` GET endpoint with joined query
4. Build `/api/blocked-users/[id]/unblock` POST endpoint
5. Add input validation and error handling across all endpoints
6. Test all endpoints with Postman / curl

### Phase 3: Frontend (Days 3–6)
1. Add allowlist management section to settings page (table, add form, CSV upload with preview, count/cap display)
2. Build blocked users list page/tab (table with expand-for-detail, filter/sort)
3. Add "Add to allowlist" quick action in feed
4. Add unblock flow with confirmation dialog
5. Add info banners explaining followed-accounts behavior and Instagram limitation
6. Add navigation, empty states, loading states, error states

### Phase 4: Testing & Polish (Days 6–7)
1. End-to-end test: add to allowlist → poll → verify content skips pipeline
2. End-to-end test: follow account on Twitter → poll → verify content skips pipeline
3. End-to-end test: CSV upload with valid file, file with errors, file that would exceed cap
4. End-to-end test: view blocked users → unblock → verify Twitter API call succeeds
5. Test edge cases (missing platform_user_id, Instagram follow-detection gap, token expiry during unblock, player unfollows someone mid-cycle)
6. Test RLS policies (user A can't see user B's allowlist)
7. Verify rate limits: poll cycle with player following 5,000+ accounts on Twitter
8. UI polish, copy review, error message review

---

## Total Estimated Effort

| Feature | Effort | Notes |
|---------|--------|-------|
| Allowlist — explicit (full stack) | ~3–4 days | DB, API, CSV import, UI |
| Allowlist — followed accounts (implicit) | ~1–2 days | Twitter API integration, caching, Instagram limitation handling |
| Blocked Users List (full stack) | ~2–3 days | Data already exists; mostly a read view + Twitter unblock API call |
| **Combined** | **~7–8 days** | Additional time vs. original estimate due to followed-accounts integration and CSV import |

---

## Decisions Log

These questions were raised during planning and have been resolved:

| Question | Decision |
|----------|----------|
| **Who can manage the allowlist?** | Players manage their own allowlist. No team/management access for now. |
| **Max allowlist size?** | 500 manual entries per player. Followed accounts are implicit and don't count toward the cap. |
| **Bulk import?** | Yes — CSV upload supported. Players can upload a file with `platform`, `username`, and optional `note` columns. |
| **Notifications for would-have-been-flagged content?** | No. The allowlist is a hard pass — no notifications. |
| **Re-block risk after unblocking?** | No special handling. Players only unblock false positives. After unblock, the account goes through normal moderation like anyone else. |
