import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: {
          0: '#faf8f4',
          1: '#ffffff',
          2: '#f1ede4',
        },
        ink: {
          DEFAULT: '#14120f',
          soft: '#4a443c',
          muted: '#8a8378',
        },
        bg: {
          base: '#faf8f4',
          surface: '#ffffff',
          elevated: '#f1ede4',
        },
        brand: {
          DEFAULT: '#137a3e',
          strong: '#0d6331',
          soft: '#e9f6ec',
          glow: '#e9f6ec',
        },
        muted: '#4a443c',
        dim: '#8a8378',
        line: '#ded8cd',
        strong: 'rgba(20,18,15,0.16)',
        glass: 'rgba(255,255,255,0.72)',
        success: {
          DEFAULT: '#137a3e',
          fg: '#0d6331',
          tint: '#e9f6ec',
          border: '#b7ddc0',
        },
        warning: {
          DEFAULT: '#b66a00',
          fg: '#7a4700',
          tint: '#fff4dd',
          border: '#eccf96',
        },
        danger: {
          DEFAULT: '#c93c37',
          fg: '#9e2f2b',
          tint: '#fff0ef',
          border: '#efc1bf',
        },
      },
      fontFamily: {
        heading: ['var(--font-heading)', 'Georgia', 'serif'],
        sans: ['var(--font-body)', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      borderRadius: {
        '2xl': '1rem',
      },
      boxShadow: {
        glow: '0 10px 28px -16px rgba(19,122,62,0.55)',
        'glow-3': '0 20px 50px -28px rgba(19,122,62,0.52)',
        paper: '0 1px 2px rgba(20,18,15,0.04), 0 12px 36px rgba(20,18,15,0.06)',
      },
      transitionTimingFunction: {
        truth: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        marquee: 'marquee 40s linear infinite',
        shimmer: 'shimmer 1.8s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
