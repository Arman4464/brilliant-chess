import type { Config } from "tailwindcss";

export const maxVertical = 1100
export const reduceSummary = 1669
export const navTop = 516

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/errors/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",

        foregroundHighlighted: "var(--foregroundHighlighted)",
        foregroundGrey: "var(--foregroundGrey)",
        foregroundBlack: "var(--foregroundBlack)",
        foregroundBlackDark: "var(--foregroundBlackDark)",

        placeholder: "var(--placeholder)",

        backgroundBox: "var(--backgroundBox)",
        backgroundBoxDarker: "var(--backgroundBoxDarker)",
        backgroundBoxHover: "var(--backgroundBoxHover)",
        backgroundBoxBox: "var(--backgroundBoxBox)",
        backgroundBoxBoxDisabled: "var(--backgroundBoxBoxDisabled)",
        backgroundBoxBoxHover: "var(--backgroundBoxBoxHover)",
        backgroundBoxBoxHighlighted: "var(--backgroundBoxBoxHighlighted)",
        backgroundBoxBoxHighlightedHover: "var(--backgroundBoxBoxHighlightedHover)",
        backgroundWhiteClock: "var(--backgroundWhiteClock)",
        backgroundBlackClock: "var(--backgroundBlackClock)",

        foregroundProfileWhite: "var(--foregroundProfileWhite)",
        foregroundProfileBlack: "var(--foregroundProfileBlack)",
        backgroundProfileWhite: "var(--backgroundProfileWhite)",
        backgroundProfileBlack: "var(--backgroundProfileBlack)",

        evaluationBarWhite: "var(--evaluationBarWhite)",
        evaluationBarBlack: "var(--evaluationBarBlack)",

        border: "var(--border)",
        borderHighlighted: "var(--borderHighlighted)",

        blackBoard: "var(--blackBoard)",
        whiteBoard: "var(--whiteBoard)",

        highlightBrilliant: "var(--highlightBrilliant)",
        highlightGreat: "var(--highlightGreat)",
        highlightBest: "var(--highlightBest)",
        highlightExcellent: "var(--highlightExcellent)",
        highlightGood: "var(--highlightGood)",
        highlightBook: "var(--highlightBook)",
        highlightInaccuracy: "var(--highlightInaccuracy)",
        highlightMistake: "var(--highlightMistake)",
        highlightMiss: "var(--highlightMiss)",
        highlightBlunder: "var(--highlightBlunder)",

        normalArrow: "var(--normalArrow)",
        bestArrow: "var(--bestArrow)",
        badArrow: "var(--badArrow)",

        winGreen: "var(--winGreen)",
        lossRed: "var(--lossRed)",

        error: "var(--error)",
        warning: "var(--warning)",
      },
      borderRadius: {
        none: "0px",
        sm: "0px",
        DEFAULT: "0px",
        md: "0px",
        lg: "0px",
        xl: "0px",
        "2xl": "0px",
        "3xl": "0px",
        full: "0px",
        borderRoundness: "0px",
        borderExtraRoundness: "0px",
      },
      boxShadow: {
        shadowBoxBoxHighlighted: "var(--shadowBoxBoxHighlighted) var(--backgroundBoxBoxHighlightedHover)",
      },
    },
    screens: {
      "sm": "640px",
      "md": "768px",
      "lg": "1024px",
      "xl": "1280px",
      "2xl": "1536px",
      "navTop": `${navTop}px`,
      "vertical": `${maxVertical}px`,
      "reduceNav": "1280px",
      "notFullDate": "1468px",
      "reduceSummary": `${reduceSummary}px`,
    }
  },
  plugins: [],
} satisfies Config;
