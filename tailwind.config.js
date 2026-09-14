// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // All colors are driven by CSS variables (see src/styles/themes.css)
        // so themes can be swapped at runtime without a rebuild.
        bg: "rgb(var(--ct-bg) / <alpha-value>)",
        surface: "rgb(var(--ct-surface) / <alpha-value>)",
        elevated: "rgb(var(--ct-elevated) / <alpha-value>)",
        border: "rgb(var(--ct-border) / <alpha-value>)",
        muted: "rgb(var(--ct-muted) / <alpha-value>)",
        text: "rgb(var(--ct-text) / <alpha-value>)",
        accent: "rgb(var(--ct-accent) / <alpha-value>)",
        accentfg: "rgb(var(--ct-accent-fg) / <alpha-value>)",
        danger: "rgb(var(--ct-danger) / <alpha-value>)",
        success: "rgb(var(--ct-success) / <alpha-value>)",
        warning: "rgb(var(--ct-warning) / <alpha-value>)",
      },
      fontFamily: {
        mono: [
          "JetBrains Mono",
          "Fira Code",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(12px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 120ms ease-out",
        "slide-up": "slide-up 160ms cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
    },
  },
  plugins: [],
};
