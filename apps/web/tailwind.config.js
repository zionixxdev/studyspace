/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Indigo-forward palette; surfaces are driven by CSS variables so the
        // glassmorphism effect adapts to light/dark without per-component logic.
        brand: {
          50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc',
          400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca',
          800: '#3730a3', 900: '#312e81',
        },
        surface: {
          DEFAULT: 'rgb(var(--ss-surface) / <alpha-value>)',
          muted: 'rgb(var(--ss-surface-muted) / <alpha-value>)',
          border: 'rgb(var(--ss-border) / <alpha-value>)',
        },
        content: {
          DEFAULT: 'rgb(var(--ss-content) / <alpha-value>)',
          muted: 'rgb(var(--ss-content-muted) / <alpha-value>)',
        },
      },
      borderRadius: { xl: '0.9rem', '2xl': '1.25rem' },
      boxShadow: {
        glass: '0 1px 2px rgba(15,23,42,0.06), 0 8px 32px rgba(15,23,42,0.10)',
      },
      backdropBlur: { glass: '12px' },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'slide-up': 'slide-up 180ms ease-out',
      },
    },
  },
  plugins: [],
};
