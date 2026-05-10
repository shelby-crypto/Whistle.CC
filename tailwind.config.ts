import type { Config } from "tailwindcss";

/**
 * Tailwind config — mirrors app/tokens.css. Both files MUST stay in sync.
 *
 * The CSS custom properties in tokens.css are the source of truth; the strings
 * below resolve to `var(--*)` so changing a hex in tokens.css updates both raw
 * CSS and Tailwind utilities. We do NOT hardcode hex values here — that would
 * defeat the single-source-of-truth contract.
 */
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Surface
        ink: {
          DEFAULT: "var(--ink)",
          2: "var(--ink-2)",
          3: "var(--ink-3)",
        },
        line: {
          DEFAULT: "var(--line)",
          2: "var(--line-2)",
        },

        // Text
        stone: {
          DEFAULT: "var(--stone)",
          2: "var(--stone-2)",
          3: "var(--stone-3)",
          4: "var(--stone-4)",
        },

        // Tiers
        clay: {
          DEFAULT: "var(--clay)",
          deep: "var(--clay-deep)",
        },
        cobalt: {
          DEFAULT: "var(--cobalt)",
          deep: "var(--cobalt-deep)",
          light: "var(--cobalt-light)",
        },
        ochre: {
          DEFAULT: "var(--ochre)",
          deep: "var(--ochre-deep)",
        },

        // Brand
        champagne: "var(--champagne)",

        // Avatar palette
        av: {
          1: "var(--av-1)",
          2: "var(--av-2)",
          3: "var(--av-3)",
          4: "var(--av-4)",
          5: "var(--av-5)",
          6: "var(--av-6)",
          7: "var(--av-7)",
          8: "var(--av-8)",
        },

        // Status
        neutral: "var(--neutral)",
      },

      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
      },

      fontSize: {
        // Tokens map to `text-display`, `text-h2`, ... so callers can ignore px.
        display: ["var(--fs-display)", { lineHeight: "var(--lh-snug)" }],
        h2:      ["var(--fs-h2)",      { lineHeight: "var(--lh-snug)" }],
        h3:      ["var(--fs-h3)",      { lineHeight: "var(--lh-snug)" }],
        body:    ["var(--fs-body)",    { lineHeight: "var(--lh-relaxed)" }],
        meta:    ["var(--fs-meta)",    { lineHeight: "var(--lh-normal)" }],
        micro:   ["var(--fs-micro)",   { lineHeight: "var(--lh-normal)" }],
      },

      // Custom spacing scale on top of Tailwind's defaults.
      // Use `p-token-3`, `gap-token-6`, etc.
      spacing: {
        "token-1":  "var(--space-1)",   //  4px
        "token-2":  "var(--space-2)",   //  8px
        "token-3":  "var(--space-3)",   // 10px
        "token-4":  "var(--space-4)",   // 12px
        "token-5":  "var(--space-5)",   // 14px
        "token-6":  "var(--space-6)",   // 16px
        "token-7":  "var(--space-7)",   // 18px
        "token-8":  "var(--space-8)",   // 20px
        "token-9":  "var(--space-9)",   // 22px
        "token-10": "var(--space-10)",  // 24px
        "token-11": "var(--space-11)",  // 28px
        "token-12": "var(--space-12)",  // 32px
      },

      borderRadius: {
        "token-1": "var(--radius-1)",   //  3px
        "token-2": "var(--radius-2)",   //  6px
        "token-3": "var(--radius-3)",   //  8px
        "token-4": "var(--radius-4)",   // 10px
        "token-5": "var(--radius-5)",   // 12px
        "token-6": "var(--radius-6)",   // 14px
      },
    },
  },
  plugins: [],
};
export default config;
