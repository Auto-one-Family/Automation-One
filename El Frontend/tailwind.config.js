/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          50: '#f8fafc',
          100: '#eaeaf2',
          200: '#e2e8f0',
          300: '#8585a0',
          400: '#484860',
          500: '#64748b',
          600: '#475569',
          700: '#1d1d2a',
          800: '#15151f',
          900: '#0d0d16',
          950: '#07070d',
        },
        iridescent: {
          1: '#60a5fa',
          2: '#818cf8',
          3: '#a78bfa',
          4: '#c084fc',
          DEFAULT: '#60a5fa',
        },
        success: {
          DEFAULT: '#34d399',
          light: 'rgba(52, 211, 153, 0.12)',
          dark: '#059669',
        },
        warning: {
          DEFAULT: '#fbbf24',
          light: 'rgba(251, 191, 36, 0.12)',
          dark: '#d97706',
        },
        danger: {
          DEFAULT: '#f87171',
          light: 'rgba(248, 113, 113, 0.12)',
          dark: '#dc2626',
        },
        info: {
          DEFAULT: '#60a5fa',
          light: 'rgba(96, 165, 250, 0.12)',
          dark: '#2563eb',
        },
        mock: {
          DEFAULT: '#a78bfa',
          light: 'rgba(167, 139, 250, 0.12)',
          border: 'rgba(167, 139, 250, 0.25)',
        },
        real: {
          DEFAULT: '#22d3ee',
          light: 'rgba(34, 211, 238, 0.12)',
          border: 'rgba(34, 211, 238, 0.25)',
        },
        esp: {
          online: '#34d399',
          offline: '#484860',
          error: '#f87171',
          safe: '#fbbf24',
        },
        accent: {
          DEFAULT: '#3b82f6',
          bright: '#60a5fa',
          dim: '#1e3a5f',
        },
        glass: {
          bg: 'rgba(255, 255, 255, 0.02)',
          border: 'rgba(255, 255, 255, 0.06)',
        },
      },

      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },

      fontSize: {
        'xs':      ['0.6875rem', { lineHeight: '1.25' }],
        'sm':      ['0.75rem',   { lineHeight: '1.35' }],
        'base':    ['0.875rem',  { lineHeight: '1.5' }],
        'lg':      ['1rem',      { lineHeight: '1.5' }],
        'xl':      ['1.25rem',   { lineHeight: '1.35' }],
        '2xl':     ['1.5rem',    { lineHeight: '1.25' }],
        'display': ['2rem',      { lineHeight: '1.2' }],
      },

      animation: {
        'shimmer': 'shimmer 4s infinite',
        'pulse-slow': 'pulse-glow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'skeleton': 'skeleton-loading 1.5s infinite',
        'pulse-dot': 'pulse-dot 2s infinite',
        'glow-line': 'glow-line 2s ease-in-out infinite',
        'fade-in': 'fade-in 0.3s ease-out forwards',
        'slide-up': 'slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-down': 'slide-down 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'blink-error': 'blink-error 1.2s ease-in-out infinite',
        'breathe': 'breathe 3s ease-in-out infinite',
        'value-flash': 'value-flash 0.4s ease-out',
        'zoom-in-exit':  'zoom-in-exit 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'zoom-in-enter': 'zoom-in-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'zoom-out-exit':  'zoom-out-exit 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'zoom-out-enter': 'zoom-out-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },

      keyframes: {
        shimmer: {
          '0%': { left: '-100%' },
          '100%': { left: '200%' },
        },
        'skeleton-loading': {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 4px currentColor' },
          '50%': { opacity: '0.6', boxShadow: '0 0 12px currentColor' },
        },
        'glow-line': {
          '0%, 100%': { opacity: '0.6', boxShadow: '0 0 4px currentColor' },
          '50%': { opacity: '1', boxShadow: '0 0 8px currentColor' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'blink-error': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
        'breathe': {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
        },
        'value-flash': {
          '0%': { backgroundColor: 'rgba(96, 165, 250, 0.15)' },
          '100%': { backgroundColor: 'transparent' },
        },
        'zoom-in-exit': {
          '0%':   { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(1.08)' },
        },
        'zoom-in-enter': {
          '0%':   { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'zoom-out-exit': {
          '0%':   { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(0.92)' },
        },
        'zoom-out-enter': {
          '0%':   { opacity: '0', transform: 'scale(1.08)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },

      boxShadow: {
        'glass': '0 8px 32px rgba(0, 0, 0, 0.4)',
        'card-hover': '0 4px 20px rgba(96, 165, 250, 0.08)',
        'iridescent': '0 4px 20px rgba(96, 165, 250, 0.15)',
        'raised': '0 1px 2px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.04)',
        'floating': '0 12px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.06)',
      },

      backdropBlur: {
        'glass': '12px',
      },

      borderRadius: {
        'sm': '6px',
        'md': '10px',
        'lg': '16px',
        'xl': '16px',
        '2xl': '16px',
      },

      screens: {
        '3xl': '1600px',
        '4xl': '1920px',
      },

      spacing: {
        '0.75': '0.1875rem',
        '1.25': '0.3125rem',
        '3.5':  '0.875rem',
        '4.5':  '1.125rem',
        '13':   '3.25rem',
        '15':   '3.75rem',
      },
    },
  },
  plugins: [],
}
