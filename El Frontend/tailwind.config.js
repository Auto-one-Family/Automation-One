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
        // Custom dark theme colors
        dark: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        // Accent colors for status
        success: {
          DEFAULT: '#22c55e',
          dark: '#16a34a',
        },
        warning: {
          DEFAULT: '#f59e0b',
          dark: '#d97706',
        },
        danger: {
          DEFAULT: '#ef4444',
          dark: '#dc2626',
        },
        // ESP state colors
        esp: {
          online: '#22c55e',
          offline: '#6b7280',
          error: '#ef4444',
          safe: '#f59e0b',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
