import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      animation: {
        'ambient': 'ambient-float 14s ease-in-out infinite',
        'ambient-slow': 'ambient-float 20s ease-in-out infinite',
        'ambient-fast': 'ambient-float 8s ease-in-out infinite',
        'shimmer': 'shimmer 2s infinite',
      },
      keyframes: {
        'ambient-float': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)', opacity: '0.35' },
          '33%': { transform: 'translate(40px, -30px) scale(1.15)', opacity: '0.55' },
          '66%': { transform: 'translate(-30px, 20px) scale(0.9)', opacity: '0.25' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
