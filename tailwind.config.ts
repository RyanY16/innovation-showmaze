import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#050816",
        panel: "#10172a",
        tile: "#13275a",
        bone: "#fff7cf",
        mint: "#34d399",
        gold: "#ffd84a",
        coral: "#ff4d6d",
        cyan: "#33c7ff"
      },
      boxShadow: {
        pixel: "0 0 0 2px #050816, 6px 6px 0 0 #050816"
      },
      fontFamily: {
        pixel: ["var(--font-pixel)", "monospace"],
        body: ["var(--font-body)", "Arial", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
