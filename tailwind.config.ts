import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#040507',
          surface: '#0a0c10',
          elevated: '#0d0d10',
        },
        brand: {
          DEFAULT: '#07dd2b',
          glow: '#07dd2b1f',
        },
        muted: '#a1a1aa',
        dim: '#888888',
        line: '#ffffff0f',
        strong: 'rgba(255,255,255,0.15)',
      },
      fontFamily: {
        heading: ['var(--font-heading)', 'sans-serif'],
        sans: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      borderRadius: {
        '2xl': '1rem',
      },
      boxShadow: {
        glow: '0 0 24px 0 #07dd2b40',
      },
    },
  },
  plugins: [],
} satisfies Config;
