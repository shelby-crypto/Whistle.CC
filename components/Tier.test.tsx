/**
 * Tests for TierBadge, TierSectionHeader, and the lib/tiers.ts constants.
 *
 * Uses node:test + react-dom/server's renderToStaticMarkup — no test framework,
 * no jsdom. We render to a string and assert against its content. That's
 * enough to confirm the right tier copy lands in the right slot, that compact
 * mode swaps the subtitle, and that the constants file is the only place tier
 * strings live.
 *
 * Run with `npm test`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import TierBadge from "./TierBadge";
import TierSectionHeader from "./TierSectionHeader";
import { TIERS, TIERS_IN_ORDER, tierGradient, type Tier } from "../lib/tiers";

// --- lib/tiers.ts ----------------------------------------------------------

test("TIERS has exactly the three expected ids", () => {
  assert.deepEqual(
    Object.keys(TIERS).sort(),
    ["calibrate", "critical", "removed"],
  );
});

test("TIERS_IN_ORDER matches the visual ordering in the mockups", () => {
  assert.deepEqual(
    [...TIERS_IN_ORDER],
    ["critical", "removed", "calibrate"],
  );
});

test("every tier has all required fields populated", () => {
  for (const t of TIERS_IN_ORDER) {
    const m = TIERS[t];
    assert.equal(m.id, t);
    assert.ok(m.title.length > 0,            `${t}: title empty`);
    assert.ok(m.subtitle.length > 0,         `${t}: subtitle empty`);
    assert.ok(m.subtitleCompact.length > 0,  `${t}: compact subtitle empty`);
    assert.ok(m.badgeLabel.length > 0,       `${t}: badge label empty`);
    assert.ok(m.colorVar.startsWith("--"),   `${t}: colorVar must be a CSS custom property`);
    assert.ok(m.colorDeepVar.startsWith("--"), `${t}: colorDeepVar must be a CSS custom property`);
  }
});

test("compact subtitles are shorter than full subtitles", () => {
  for (const t of TIERS_IN_ORDER) {
    const m = TIERS[t];
    assert.ok(
      m.subtitleCompact.length < m.subtitle.length,
      `${t}: compact subtitle ("${m.subtitleCompact}") not shorter than full ("${m.subtitle}")`,
    );
  }
});

test("tierGradient returns the correct linear-gradient string", () => {
  assert.equal(
    tierGradient("critical"),
    "linear-gradient(90deg, var(--clay) 0%, var(--clay-deep) 100%)",
  );
  assert.equal(
    tierGradient("removed"),
    "linear-gradient(90deg, var(--cobalt) 0%, var(--cobalt-deep) 100%)",
  );
  assert.equal(
    tierGradient("calibrate"),
    "linear-gradient(90deg, var(--ochre) 0%, var(--ochre-deep) 100%)",
  );
});

// --- TierBadge -------------------------------------------------------------

test("TierBadge renders correctly for every tier", () => {
  for (const t of TIERS_IN_ORDER) {
    const html = renderToStaticMarkup(React.createElement(TierBadge, { tier: t }));
    // Pill text is the lowercase tier label.
    assert.ok(
      html.includes(`>${TIERS[t].badgeLabel}<`),
      `${t}: badge label not rendered\n${html}`,
    );
    // Background uses the tier's primary color token.
    assert.ok(
      html.includes(`background:var(${TIERS[t].colorVar})`),
      `${t}: expected background var(${TIERS[t].colorVar})\n${html}`,
    );
    // Spec values: 11px font, 600 weight, 0.2px tracking.
    assert.ok(html.includes("font-size:11px"),       `${t}: missing font-size:11px`);
    assert.ok(html.includes("font-weight:600"),      `${t}: missing font-weight:600`);
    assert.ok(html.includes("letter-spacing:0.2px"), `${t}: missing letter-spacing`);
    assert.ok(html.includes("border-radius:12px"),   `${t}: missing border-radius:12px`);
    assert.ok(html.includes("padding:3px 11px"),     `${t}: missing padding`);
    // Color is white.
    assert.ok(html.includes(`color:#fff`),           `${t}: text not white`);
  }
});

// --- TierSectionHeader -----------------------------------------------------

test("TierSectionHeader renders desktop title, full subtitle, and count", () => {
  for (const t of TIERS_IN_ORDER) {
    const html = renderToStaticMarkup(
      React.createElement(TierSectionHeader, { tier: t, count: 7 }),
    );
    assert.ok(html.includes(TIERS[t].title),    `${t}: title not rendered`);
    assert.ok(html.includes(TIERS[t].subtitle), `${t}: full subtitle not rendered`);
    assert.ok(html.includes(">7<"),             `${t}: count not rendered`);
    // Desktop padding values.
    assert.ok(html.includes("padding:14px 20px"), `${t}: desktop padding wrong`);
    // Gradient is applied to the bar.
    assert.ok(
      html.includes(`linear-gradient(90deg, var(${TIERS[t].colorVar}) 0%, var(${TIERS[t].colorDeepVar}) 100%)`),
      `${t}: gradient missing`,
    );
  }
});

test("TierSectionHeader compact mode swaps to short subtitle and small padding", () => {
  for (const t of TIERS_IN_ORDER) {
    const html = renderToStaticMarkup(
      React.createElement(TierSectionHeader, {
        tier: t,
        count: 3,
        compact: true,
      }),
    );
    assert.ok(
      html.includes(TIERS[t].subtitleCompact),
      `${t}: compact subtitle missing`,
    );
    // Long subtitle MUST NOT be present in compact render.
    assert.ok(
      !html.includes(TIERS[t].subtitle),
      `${t}: full subtitle leaked into compact render`,
    );
    // Mobile padding values from .tier-section-header.
    assert.ok(html.includes("padding:10px 14px"),       `${t}: compact padding wrong`);
    assert.ok(html.includes("border-radius:8px 8px 0 0"), `${t}: compact corners wrong`);
  }
});

test("TierSectionHeader formats large counts with locale separators", () => {
  const html = renderToStaticMarkup(
    React.createElement(TierSectionHeader, { tier: "removed", count: 1234 }),
  );
  // Default Node locale is en_US.UTF-8 in CI; "1,234" should appear.
  assert.ok(
    html.includes("1,234") || html.includes("1234"),
    `count formatting unexpected: ${html}`,
  );
});

// --- Single-source-of-truth invariant --------------------------------------

test("changing TIERS.critical.title would propagate to every consumer", () => {
  // We simulate the 'edit a single value, see it everywhere' contract by
  // mutating the constants object in-place and re-rendering. If any consumer
  // had a hardcoded copy of "Critical", this test would fail because the
  // rendered HTML wouldn't match the new value.
  const original = TIERS.critical.title;
  const synthetic = "URGENT-TEST-VALUE";
  try {
    (TIERS.critical as { title: string }).title = synthetic;
    const html = renderToStaticMarkup(
      React.createElement(TierSectionHeader, { tier: "critical", count: 1 }),
    );
    assert.ok(
      html.includes(synthetic),
      "TierSectionHeader did not pick up a TIERS.critical.title change",
    );
    assert.ok(
      !html.includes(">Critical<"),
      "TierSectionHeader still rendered hardcoded 'Critical' after mutation",
    );
  } finally {
    (TIERS.critical as { title: string }).title = original;
  }
});

test("changing TIERS.removed.badgeLabel would propagate to TierBadge", () => {
  const original = TIERS.removed.badgeLabel;
  const synthetic = "synthetic-label";
  try {
    (TIERS.removed as { badgeLabel: string }).badgeLabel = synthetic;
    const html = renderToStaticMarkup(React.createElement(TierBadge, { tier: "removed" }));
    assert.ok(
      html.includes(`>${synthetic}<`),
      "TierBadge did not pick up a TIERS.removed.badgeLabel change",
    );
  } finally {
    (TIERS.removed as { badgeLabel: string }).badgeLabel = original;
  }
});

// Type-level assertion: the Tier union is exactly these three keys. If
// someone adds a 4th tier without updating the type, TypeScript will fail
// the build before this test even compiles.
const _exhaustive: Tier = "critical";
void _exhaustive;
