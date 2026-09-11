import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F7F8F6",
        surface: "#FFFFFF",
        ink: { DEFAULT: "#1B2C25", soft: "#4A5A53", faint: "#8A968F" },
        rule: { DEFAULT: "#DFE3DF", strong: "#C3CAC5" },
        pine: { DEFAULT: "#2F6E52", dark: "#24553F", light: "#E7F0EA" },
        wheat: { DEFAULT: "#D8C48F", light: "#FAF4E4" },
        clay: { DEFAULT: "#A6402F", light: "#FBEAE6" },
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      fontSize: {
        xxs: ["0.6875rem", { lineHeight: "1rem" }],
      },
      borderRadius: { sm: "3px", DEFAULT: "4px", md: "6px" },
    },
  },
  plugins: [],
} satisfies Config;
