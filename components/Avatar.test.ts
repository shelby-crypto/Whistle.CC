/**
 * Unit tests for the Avatar pure helpers.
 *
 * Uses node:test (built into Node) + node:assert — no test framework needed.
 * TypeScript is loaded via tsx; run with:
 *   npm test
 * (which is wired to `node --import tsx --test components/Avatar.test.ts`).
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  getAvatarTokenIndex,
  getInitials,
  hashHandle,
  AVATAR_TOKEN_COUNT,
} from "./avatarUtils";

test("hashHandle is deterministic across calls", () => {
  const a = hashHandle("m_torres_42");
  const b = hashHandle("m_torres_42");
  const c = hashHandle("m_torres_42");
  assert.equal(a, b);
  assert.equal(b, c);
});

test("getAvatarTokenIndex returns the same color for the same handle", () => {
  // This is the core acceptance criterion: rendering twice in different
  // parts of the app must pick the same swatch.
  const first = getAvatarTokenIndex("m_torres_42");
  const second = getAvatarTokenIndex("m_torres_42");
  assert.equal(first, second);
});

test("m_torres_42 maps to --av-1 (slate-blue)", () => {
  // Acceptance: Avatar({handle: "m_torres_42"}) produces a slate-blue circle.
  // --av-1 is #5D7B9C, the slate-blue swatch in the palette.
  assert.equal(getAvatarTokenIndex("m_torres_42"), 1);
});

test("@-prefix is stripped before hashing", () => {
  // The leading @ shouldn't change the deterministic bucket — same person.
  assert.equal(
    getAvatarTokenIndex("@m_torres_42"),
    getAvatarTokenIndex("m_torres_42"),
  );
});

test("getAvatarTokenIndex stays within the 1..8 palette", () => {
  const samples = [
    "a",
    "alice",
    "@bob",
    "carla_diaz",
    "dev_42",
    "ezekiel-jones",
    "fern.green",
    "gigi_hadid",
    "harper",
    "indira",
    "jiro_ono",
    "kelsey",
    "luca_rossi",
    "m_torres_42",
    "nico",
    "olivia.park",
    "priya",
    "quinn_brown",
  ];
  for (const h of samples) {
    const idx = getAvatarTokenIndex(h);
    assert.ok(
      idx >= 1 && idx <= AVATAR_TOKEN_COUNT,
      `expected 1..${AVATAR_TOKEN_COUNT}, got ${idx} for "${h}"`,
    );
  }
});

test("different handles produce visibly different colors most of the time", () => {
  // "Most of the time" with 8 buckets and ~20 distinct samples: birthday
  // problem says we expect collisions, but we should see most buckets used.
  const samples = [
    "alice", "bob", "carla", "dev42", "ezekiel",
    "fern_green", "gigi", "harper_lee", "indira", "jiro",
    "kelsey", "luca_rossi", "maya", "nico_park", "olivia",
    "priya", "quinn", "rashid_khan", "sara", "tomas",
  ];
  const buckets = new Set(samples.map(getAvatarTokenIndex));
  // Across 20 distinct handles we expect to hit at least 5 of the 8 buckets.
  // If this ever fails, the hash distribution has degenerated.
  assert.ok(
    buckets.size >= 5,
    `only ${buckets.size}/8 buckets used: ${[...buckets].sort().join(",")}`,
  );
});

test("getInitials uses displayName when provided", () => {
  assert.equal(
    getInitials({ handle: "x", displayName: "Maria Torres" }),
    "MT",
  );
  assert.equal(
    getInitials({ handle: "x", displayName: "Alice" }),
    "A",
  );
});

test("getInitials falls back to handle when displayName is missing", () => {
  // Acceptance: Avatar({handle: "m_torres_42"}) shows "MT".
  assert.equal(getInitials({ handle: "m_torres_42" }), "MT");
  assert.equal(getInitials({ handle: "@m_torres_42" }), "MT");
  assert.equal(getInitials({ handle: "alice" }), "A");
  assert.equal(getInitials({ handle: "ezekiel-jones" }), "EJ");
  assert.equal(getInitials({ handle: "fern.green" }), "FG");
});

test("getInitials ignores numeric-only segments", () => {
  // "m_torres_42" -> ["m", "torres", "42"] -> drop "42" -> "MT", not "MT" via
  // a different path. The point is "42" never becomes an initial.
  assert.equal(getInitials({ handle: "user_42_99" }), "U");
});

test("getInitials never returns empty string", () => {
  // Defensive: garbage in still gets a renderable glyph out, so the avatar
  // can't render blank.
  assert.equal(getInitials({ handle: "12345" }), "?");
  assert.equal(getInitials({ handle: "" }), "?");
});

test("displayName beats handle even when handle would parse cleanly", () => {
  assert.equal(
    getInitials({ handle: "m_torres_42", displayName: "Quinn Brown" }),
    "QB",
  );
});
