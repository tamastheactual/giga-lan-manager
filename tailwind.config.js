/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{svelte,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'space': {
          900: '#0a0e1a',
          800: '#121830',
          700: '#1a2040',
          600: '#252b50',
        },
        'cyber': {
          green: '#23B7D1',  /* Primary cyan from logo */
          pink: '#FF914D',   /* Orange accent from logo */
          blue: '#4A5394',   /* Deep blue-purple from logo */
        },
        'brand': {
          cyan: '#23B7D1',
          orange: '#FF914D',
          purple: '#4A5394',
          blue: '#385C94',
        },
        'gaming-dark': '#0a0e1a',
        'gaming-accent': '#FF914D',
        'gaming-secondary': '#1a2040',
        'gaming-text': '#e8eef5',
      },
      fontFamily: {
        'display': ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'glow': 'glow 2s ease-in-out infinite alternate',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 3s ease-in-out infinite',
        'slide-in': 'slideIn 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 20px rgba(35, 183, 209, 0.5), 0 0 40px rgba(35, 183, 209, 0.3)' },
          '100%': { boxShadow: '0 0 30px rgba(35, 183, 209, 0.8), 0 0 60px rgba(35, 183, 209, 0.5)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        slideIn: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'glow-green': '0 0 20px rgba(35, 183, 209, 0.5)',
        'glow-cyan': '0 0 20px rgba(35, 183, 209, 0.5)',
        'glow-pink': '0 0 20px rgba(255, 145, 77, 0.5)',
        'glow-orange': '0 0 20px rgba(255, 145, 77, 0.5)',
        'glow-blue': '0 0 20px rgba(74, 83, 148, 0.5)',
        'card': '0 8px 32px rgba(0, 0, 0, 0.4)',
        'card-hover': '0 12px 48px rgba(35, 183, 209, 0.2)',
      },
    },
  },
  plugins: [],
}
