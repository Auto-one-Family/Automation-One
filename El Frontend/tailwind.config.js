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
        // === DARK THEME BASIS ===
        // Maps to CSS variables for consistency
        dark: {
          50: '#f8fafc',
          100: '#f0f0f5',   // --color-text-primary
          200: '#e2e8f0',
          300: '#a0a0b0',   // --color-text-secondary
          400: '#606070',   // --color-text-muted
          500: '#64748b',
          600: '#475569',
          700: '#22222e',   // --color-bg-hover
          800: '#1a1a24',   // --color-bg-tertiary
          900: '#12121a',   // --color-bg-secondary
          950: '#0a0a0f',   // --color-bg-primary
        },
        
        // === IRIDESCENT COLORS ===
        iridescent: {
          1: '#60a5fa',     // Blue
          2: '#818cf8',     // Violet-Blue
          3: '#a78bfa',     // Violet
          4: '#c084fc',     // Pink-Violet
          DEFAULT: '#60a5fa',
        },
        
        // === STATUS COLORS ===
        success: {
          DEFAULT: '#34d399',
          light: 'rgba(52, 211, 153, 0.15)',
          dark: '#059669',
        },
        warning: {
          DEFAULT: '#fbbf24',
          light: 'rgba(251, 191, 36, 0.15)',
          dark: '#d97706',
        },
        danger: {
          DEFAULT: '#f87171',
          light: 'rgba(248, 113, 113, 0.15)',
          dark: '#dc2626',
        },
        info: {
          DEFAULT: '#60a5fa',
          light: 'rgba(96, 165, 250, 0.15)',
          dark: '#2563eb',
        },
        
        // === MOCK/REAL DISTINCTION ===
        mock: {
          DEFAULT: '#a78bfa',
          light: 'rgba(167, 139, 250, 0.15)',
          border: 'rgba(167, 139, 250, 0.3)',
        },
        real: {
          DEFAULT: '#22d3ee',
          light: 'rgba(34, 211, 238, 0.15)',
          border: 'rgba(34, 211, 238, 0.3)',
        },
        
        // === ESP STATE COLORS ===
        esp: {
          online: '#34d399',
          offline: '#606070',
          error: '#f87171',
          safe: '#fbbf24',
        },
        
        // === GLASS EFFECTS ===
        glass: {
          bg: 'rgba(255, 255, 255, 0.03)',
          border: 'rgba(255, 255, 255, 0.08)',
        },
      },
      
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      
      // === CUSTOM ANIMATIONS ===
      animation: {
        'shimmer': 'shimmer 4s infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'skeleton': 'skeleton-loading 1.5s infinite',
        'pulse-dot': 'pulse-dot 2s infinite',
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
          '50%': { opacity: '0.5' },
        },
      },
      
      // === BOX SHADOWS ===
      boxShadow: {
        'glass': '0 8px 32px rgba(0, 0, 0, 0.3)',
        'card-hover': '0 4px 20px rgba(96, 165, 250, 0.1)',
        'iridescent': '0 4px 20px rgba(96, 165, 250, 0.2)',
      },
      
      // === BACKDROP BLUR ===
      backdropBlur: {
        'glass': '12px',
      },
      
      // === BORDER RADIUS ===
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
      },
    },
  },
  plugins: [],
}
