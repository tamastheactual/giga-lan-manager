/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{svelte,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* -------------------------------------------------------------
         * SURFACES - a cool near-black ramp.
         *
         * Replaces the navy-blue gradient ground. Depth now comes from small
         * lightness steps and 1px hairlines rather than coloured glow, which
         * is what made every panel shout for attention equally.
         * ----------------------------------------------------------- */
        'space': {
          900: '#0B0D11',  /* page ground   */
          800: '#101319',  /* raised        */
          700: '#161A21',  /* card          */
          600: '#1E232C',  /* control/hover */
          500: '#2A303B',  /* strong border */
        },

        /* -------------------------------------------------------------
         * ACCENT - the logo cyan, retuned for legibility on near-black.
         * One hue carries every interactive and branded element.
         * ----------------------------------------------------------- */
        'accent': {
          DEFAULT: '#2BC4DE',
          soft: '#7FE3F5',
          deep: '#178DA3',
        },
        'ember': { DEFAULT: '#FF9A5A', soft: '#FFC09A' },
        'deep':  { DEFAULT: '#5A63A8', soft: '#7B85C8' },

        /* Semantic. Muted rather than neon, and used ONLY for meaning. */
        'win':  '#3ECF8E',
        'loss': '#F2606F',
        'draw': '#E9B949',
        'gold':   '#E8C15C',
        'silver': '#B6BECC',
        'bronze': '#C98A5B',

        /* Text tones. */
        'ink': {
          DEFAULT: '#EDF0F4',
          muted: '#9BA5B4',
          faint: '#6B7482',
        },

        /* -------------------------------------------------------------
         * Legacy aliases, remapped onto the palette above.
         *
         * The names are misleading and predate it: `cyber-green` is CYAN,
         * `cyber-pink` is ORANGE, `cyber-blue` is PURPLE - reaching for
         * "green" silently produced cyan, which is a good part of why the UI
         * drifted. Kept so the ~320 existing usages re-skin automatically;
         * prefer accent / ember / deep / win / loss in new markup.
         * ----------------------------------------------------------- */
        'cyber': { green: '#2BC4DE', pink: '#FF9A5A', blue: '#5A63A8' },
        'brand': { cyan: '#2BC4DE', orange: '#FF9A5A', purple: '#5A63A8', blue: '#3F6FA8' },
        'gaming-dark': '#0B0D11',
        'gaming-accent': '#FF9A5A',
        'gaming-secondary': '#161A21',
        'gaming-text': '#EDF0F4',
      },
      fontFamily: {
        sans: ['Archivo', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Archivo', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
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
        /* Depth by elevation, not by coloured halo. The former glow-* shadows
         * put a cyan or orange corona on nearly every panel and button, so
         * nothing could be emphasised relative to anything else. Kept under
         * the old names so existing markup picks up the new, quieter values. */
        'glow-green':  '0 1px 2px rgba(0,0,0,.5), 0 8px 24px -12px rgba(43,196,222,.35)',
        'glow-cyan':   '0 1px 2px rgba(0,0,0,.5), 0 8px 24px -12px rgba(43,196,222,.35)',
        'glow-pink':   '0 1px 2px rgba(0,0,0,.5), 0 8px 24px -12px rgba(255,154,90,.30)',
        'glow-orange': '0 1px 2px rgba(0,0,0,.5), 0 8px 24px -12px rgba(255,154,90,.30)',
        'glow-blue':   '0 1px 2px rgba(0,0,0,.5), 0 8px 24px -12px rgba(90,99,168,.35)',
        'card':        '0 1px 2px rgba(0,0,0,.4)',
        'card-hover':  '0 2px 4px rgba(0,0,0,.45), 0 12px 32px -16px rgba(0,0,0,.8)',
      },
    },
  },
  plugins: [],
}
