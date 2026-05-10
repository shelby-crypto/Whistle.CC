# Whistle Design Tokens

Single source of truth for color, type, spacing, and radii — extracted from
`whistle_DESKTOP_1.html` and `whistle_MOBILE_FINAL.html`. Do not hardcode hex
values in components; reference a token instead.

## Where the tokens live

| File | Purpose |
| --- | --- |
| `app/tokens.css` | The source of truth. Every token is a CSS custom property on `:root`. |
| `tailwind.config.ts` | Mirrors the same tokens as Tailwind theme keys, all resolving to `var(--*)` so changing a hex in `tokens.css` propagates everywhere. |
| `app/globals.css` | Imports `tokens.css` once and applies the body defaults (`background: var(--ink); color: var(--stone); font-family: var(--font-sans)`). |
| `app/layout.tsx` | Loads DM Sans and DM Serif Display via `next/font/google` and exposes them as `--font-dm-sans` / `--font-dm-serif`, which `tokens.css` chains into `--font-sans` / `--font-serif`. |

Tokens are available globally as CSS variables — **no import statements
needed in components**. They are also available via Tailwind utilities.

## Two ways to use a token

### 1. CSS variables (raw CSS, inline styles, SVG `fill` / `stroke`)

```tsx
<svg>
  <line stroke="var(--line-2)" />
  <path stroke="var(--clay)" />
</svg>

<div style={{ background: "var(--ink-2)", borderRadius: "var(--radius-5)" }} />
```

### 2. Tailwind utilities (preferred for class-based styling)

```tsx
<div className="bg-ink-2 border border-line text-stone-3 rounded-token-5 p-token-9">
  <h2 className="font-serif text-h2 text-stone">Waiting on you</h2>
  <p className="font-sans text-meta text-stone-3">Two items need a decision.</p>
</div>
```

Class shape: `{property}-{token-name}`. Numbered scales drop the `-DEFAULT`,
so `bg-ink` is `--ink`, `bg-ink-2` is `--ink-2`, `text-stone-4` is
`--stone-4`, etc.

## Color tokens

### Surface
`--ink` `#0F1419` page • `--ink-2` `#131820` card • `--ink-3` `#1A2028` elevated
`--line` `#1F2933` hairline • `--line-2` `#2A3340` strong border

### Text
`--stone` `#F5EFE6` primary • `--stone-2` `#C5CDD7` secondary
`--stone-3` `#9AA4B0` muted • `--stone-4` `#6B7480` disabled

### Tier semantics
`--clay` `#B83C2A` / `--clay-deep` `#8F2D1E` — high / critical
`--ochre` `#C8923D` / `--ochre-deep` `#9B6F26` — medium / calibrate
`--cobalt` `#2D4A6B` / `--cobalt-deep` `#1F3550` / `--cobalt-light` `#6B95C7` — informational

### Brand
`--champagne` `#2DD4BF` — brand teal, accent, low-risk OK

> `--champagne-deep` was listed in the original spec but does not appear in
> either mockup, so it is not defined. Add it to `tokens.css` if and when a
> mockup introduces it.

### Avatar palette
`--av-1` … `--av-8` — eight muted, accessible avatar background colors. Cycle
through them for user/team avatars.

### Status
`--neutral` `#3A4350` — off-state for toggles, inactive chips.

## Typography

Two families, loaded via `next/font/google` in `app/layout.tsx`:

- `--font-serif` (DM Serif Display, weight 400) — display + h2 + h3 only.
- `--font-sans` (DM Sans, weights 400/500/600/700) — everything else.

Type scale, with the tokens that map onto each step:

| Token | Size | Tailwind | Used for |
| --- | --- | --- | --- |
| `--fs-display` | 32px | `text-display` | Page title (`.page-title`) |
| `--fs-h2` | 22px | `text-h2` | Section heading (`.waiting-header`, `.section-label`) |
| `--fs-h3` | 18px | `text-h3` | Mobile card heading |
| `--fs-body` | 13px | `text-body` | Default body, row copy |
| `--fs-meta` | 12px | `text-meta` | Captions, secondary meta |
| `--fs-micro` | 11px | `text-micro` | Eyebrow, tier-context |

Line heights: `--lh-tight` (1) for big numbers, `--lh-snug` (1.25) for
headings, `--lh-normal` (1.45) for mobile body, `--lh-relaxed` (1.5) for
desktop body.

Weights: `--fw-regular` 400 / `--fw-medium` 500 / `--fw-semibold` 600 /
`--fw-bold` 700.

## Spacing

Twelve-step scale — every value appears at least once in the mockups:

| Token | Value | Tailwind |
| --- | --- | --- |
| `--space-1` | 4px | `p-token-1`, `gap-token-1`, … |
| `--space-2` | 8px | `p-token-2` |
| `--space-3` | 10px | `p-token-3` |
| `--space-4` | 12px | `p-token-4` |
| `--space-5` | 14px | `p-token-5` |
| `--space-6` | 16px | `p-token-6` |
| `--space-7` | 18px | `p-token-7` |
| `--space-8` | 20px | `p-token-8` |
| `--space-9` | 22px | `p-token-9` |
| `--space-10` | 24px | `p-token-10` |
| `--space-11` | 28px | `p-token-11` |
| `--space-12` | 32px | `p-token-12` |

The numeric Tailwind suffix (`token-1` … `token-12`) is the index in the scale,
not the px value — that way the scale stays meaningful when individual sizes
shift. Tailwind's default spacing utilities (`p-2`, `gap-4`, etc.) still work;
use `*-token-N` only when you specifically want one of the twelve scale steps.

## Radii

| Token | Value | Tailwind | Used for |
| --- | --- | --- | --- |
| `--radius-1` | 3px | `rounded-token-1` | Checkbox, tiny chip |
| `--radius-2` | 6px | `rounded-token-2` | Small pill, icon tile |
| `--radius-3` | 8px | `rounded-token-3` | Button, status line, nav item |
| `--radius-4` | 10px | `rounded-token-4` | Tier card, section, chart |
| `--radius-5` | 12px | `rounded-token-5` | Waiting block, surface card |
| `--radius-6` | 14px | `rounded-token-6` | Outer frame, large container |

## Adding a new token

1. Add the CSS custom property to `app/tokens.css`.
2. Mirror it in `tailwind.config.ts` as `var(--your-new-token)` so utilities resolve correctly.
3. Update this README so the team knows where to use it.

If the token isn't actually used in a shipped mockup, don't add it. The
mockups are the authority — speculative tokens cause drift.

## Migration notes

- `app/layout.tsx`: removed `Inter` and `bg-gray-950 text-gray-100`. Body
  styling now comes from `globals.css` body defaults driven by tokens.
- `app/page.tsx`: SVG chart hex values (`#374151`, `#6b7280`, `#9ca3af`,
  `#ef4444`, `#eab308`, `#14b8a6`) replaced with `var(--line-2)`,
  `var(--stone-4)`, `var(--stone-3)`, `var(--clay)`, `var(--ochre)`, and
  `var(--champagne)` respectively.
- Tailwind utility classes that reference Tailwind's default palette
  (`bg-gray-900`, `bg-teal-500`, etc.) in `components/AppShell.tsx`,
  `components/SidebarNav.tsx`, and `components/BottomNav.tsx` have been
  intentionally left in place — those are component-rebuild scope, not
  token-extraction scope. They should be migrated when those components are
  rebuilt against the new mockups.
- Stale prototype files at the repo root (`whistle-dashboard.jsx`,
  `redesign-options.html`, etc.) are not imported by the live app and are
  also out of scope.
