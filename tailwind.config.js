/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#080B14',
        surface: '#0D1117',
        'surface-2': '#111827',
        'surface-3': '#1A2235',
        border: '#1F2937',
        'border-bright': '#374151',
        accent: '#00FFA3',
        'accent-dim': '#00CC82',
        cyan: '#00D4FF',
        'cyan-dim': '#00AACC',
        purple: '#7C3AED',
        'purple-dim': '#6D28D9',
        red: '#FF4444',
        'red-dim': '#CC3333',
        green: '#00FFA3',
        'green-dim': '#00CC82',
        yellow: '#FFB800',
        text: '#F9FAFB',
        'text-2': '#9CA3AF',
        'text-3': '#6B7280',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      backgroundImage: {
        'grid-pattern':
          "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%231F2937' fill-opacity='0.3'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        'glow-accent': 'radial-gradient(ellipse at center, rgba(0,255,163,0.15) 0%, transparent 70%)',
        'glow-cyan': 'radial-gradient(ellipse at center, rgba(0,212,255,0.15) 0%, transparent 70%)',
        'hero-gradient': 'linear-gradient(135deg, #080B14 0%, #0D1421 50%, #080B14 100%)',
      },
      boxShadow: {
        glow: '0 0 20px rgba(0,255,163,0.3)',
        'glow-cyan': '0 0 20px rgba(0,212,255,0.3)',
        'glow-sm': '0 0 10px rgba(0,255,163,0.2)',
        glass: '0 8px 32px rgba(0,0,0,0.4)',
        card: '0 4px 24px rgba(0,0,0,0.5)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.4s ease-out',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        ticker: 'ticker 30s linear infinite',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 10px rgba(0,255,163,0.2)' },
          '50%': { boxShadow: '0 0 25px rgba(0,255,163,0.5)' },
        },
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
