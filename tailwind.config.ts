import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // ── Design system color tokens (R1 — Korean minimal light) ─────────────
      colors: {
        primary:                   "#002444",
        "primary-container":       "#1b3a5c",
        "on-primary":              "#ffffff",
        "on-primary-container":    "#87a4cc",
        secondary:                 "#5e5e5e",
        background:                "#fbf9f8",
        surface:                   "#fbf9f8",
        "surface-container-lowest":"#ffffff",
        "surface-container-low":   "#f6f3f2",
        "surface-container":       "#f0eded",
        "surface-container-high":  "#eae8e7",
        "surface-variant":         "#e4e2e1",
        "on-surface":              "#1b1c1c",
        "on-surface-variant":      "#43474e",
        outline:                   "#73777f",
        "outline-variant":         "#c3c6cf",
        error:                     "#ba1a1a",
        "error-container":         "#ffdad6",
        "on-error":                "#ffffff",
        "on-error-container":      "#93000a",
        "inverse-primary":         "#abc9f2",
      },

      // ── Border radius ───────────────────────────────────────────────────────
      borderRadius: {
        DEFAULT: "0.125rem",  // 2px
        sm:      "0.125rem",  // 2px
        lg:      "0.25rem",   // 4px
        xl:      "0.5rem",    // 8px
        "2xl":   "1rem",      // 16px
        full:    "0.75rem",   // 12px
      },

      // ── Spacing ─────────────────────────────────────────────────────────────
      spacing: {
        xs:                "4px",
        sm:                "8px",
        md:                "16px",
        lg:                "24px",
        xl:                "40px",
        gutter:            "16px",
        "container-margin":"32px",
      },

      // ── Font families ────────────────────────────────────────────────────────
      fontFamily: {
        inter: ["Inter", "sans-serif"],
        noto:  ["'Noto Sans KR'", "sans-serif"],
        // Overrides Tailwind's font-mono with Inter (design spec: mono = Inter)
        mono:  ["Inter", "ui-monospace", "SFMono-Regular", "monospace"],
      },

      // ── Typography scale ─────────────────────────────────────────────────────
      // Usage: text-display font-inter font-semibold
      fontSize: {
        display:       ["32px", { lineHeight: "40px",  letterSpacing: "-0.02em" }],
        "headline-lg": ["24px", { lineHeight: "32px",  letterSpacing: "-0.01em" }],
        "headline-md": ["20px", { lineHeight: "28px"                            }],
        "body-lg":     ["16px", { lineHeight: "24px"                            }],
        "body-md":     ["14px", { lineHeight: "20px"                            }],
        "label-md":    ["13px", { lineHeight: "18px"                            }],
        "label-sm":    ["12px", { lineHeight: "16px"                            }],
        "type-mono":   ["13px", { lineHeight: "18px"                            }],
      },
    },
  },
  plugins: [],
};

export default config;
