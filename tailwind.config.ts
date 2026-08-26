import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      screens: {
        'xs': '475px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        muted: "var(--muted-foreground)",
        subtle: "var(--subtle-foreground)",
        accent: {
          DEFAULT: 'var(--accent)',
          light: 'var(--accent-light)',
          dark: 'var(--accent-dark)',
        },
        /* gold/onyx kept for any markup still referencing them directly; prefer `accent` for new theme-aware work */
        gold: {
          DEFAULT: '#d4af37',
          light: '#f4e4bc',
          dark: '#a8862c',
        },
        onyx: {
          DEFAULT: '#08070a',
          light: '#111014',
        },
        emerald: {
          deep: '#0b6b4f',
        },
      },
      fontFamily: {
        display: ['var(--font-display)'],
        sans: ['var(--font-sans)'],
      },
      animation: {
        'ambient': 'ambient-float 14s ease-in-out infinite',
        'ambient-slow': 'ambient-float 20s ease-in-out infinite',
        'ambient-fast': 'ambient-float 8s ease-in-out infinite',
        'shimmer': 'shimmer 2s infinite',
        'spin-slow': 'spin 3s linear infinite',
        'ping-slow': 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'pulse-fast': 'pulse 0.5s ease-in-out',
        'fire': 'fire 0.3s ease-in-out',
        'shine': 'shine 3.5s ease-in-out infinite',
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
        slideInRight: {
          from: { transform: 'translateX(100%)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        slideInLeft: {
          from: { transform: 'translateX(-100%)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        slideUp: {
          from: { transform: 'translateY(100%)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        pulse: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.7', transform: 'scale(1.05)' },
        },
        fire: {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.2)', opacity: '0.8' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shine: {
          '0%, 100%': { backgroundPosition: '200% center' },
          '50%': { backgroundPosition: '0% center' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
