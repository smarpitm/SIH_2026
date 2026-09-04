import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Quantum²-inspired cyan accent — decorative fills/rings use DEFAULT,
        // text on light uses 600/700 for 4.5:1 contrast.
        accent: {
          DEFAULT: "#38c6ec",
          50: "#eefafd",
          100: "#d7f3fa",
          200: "#b5e9f6",
          300: "#7fdcf4",
          400: "#38c6ec",
          600: "#0e93bd",
          700: "#0b7a9d",
          800: "#0d5f79",
        },
      },
      fontFamily: {
        sans: ["var(--font-figtree)", ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [],
};
export default config;
