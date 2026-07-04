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
        // era #888888 — abaixo de AA; mínimo agora é #a1a1aa
        dim: '#a1a1aa',
        line: '#ffffff0f',
        strong: 'rgba(255,255,255,0.15)',
        glass: 'rgba(255,255,255,0.03)',
        success: {
          DEFAULT: '#07dd2b',
          fg: '#4ade80',
          tint: 'rgba(7,221,43,0.10)',
          border: 'rgba(7,221,43,0.30)',
        },
        warning: {
          DEFAULT: '#f59e0b',
          fg: '#fbbf24',
          tint: 'rgba(245,158,11,0.10)',
          border: 'rgba(245,158,11,0.30)',
        },
        danger: {
          DEFAULT: '#ef4444',
          fg: '#f87171',
          tint: 'rgba(239,68,68,0.10)',
          border: 'rgba(239,68,68,0.30)',
        },
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
        // glow assinatura em 3 camadas (DNA do site)
        'glow-3':
          '0 0 60px -10px #07dd2b4d, 0 0 28px -6px #07dd2b33, 0 0 12px 0 #07dd2b1f',
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
