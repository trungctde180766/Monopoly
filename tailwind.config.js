/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        tycoon: {
          bg: '#0f172a',
          surface: '#1e293b',
          border: '#334155',
          gold: '#eab308',
          emerald: '#10b981',
          crimson: '#ef4444',
          accent: '#6366f1'
        }
      },
      boxShadow: {
        'glow-gold': '0 0 25px rgba(234, 179, 8, 0.4)',
        'glow-cyan': '0 0 25px rgba(6, 182, 212, 0.4)',
        'glow-emerald': '0 0 25px rgba(16, 185, 129, 0.4)',
        'board': '0 25px 60px -15px rgba(0, 0, 0, 0.7)',
      },
      animation: {
        'bounce-subtle': 'bounce 2s infinite',
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}

