/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          950: '#0B0C0E',
          900: '#121317',
          800: '#1B1D22',
          700: '#25272E',
          600: '#34363F',
          500: '#4B4E59',
        },
        paper: {
          50: '#FAFAF9',
          100: '#F3F3F1',
          200: '#E8E8E5',
        },
        signal: {
          50: '#EEF1FF',
          100: '#DCE1FF',
          300: '#9AA6FF',
          400: '#6E7BFB',
          500: '#4F5EF0',
          600: '#3F4AD1',
          700: '#333DA8',
        },
        ember: {
          400: '#FF6B6B',
          500: '#FB4B4B',
        },
      },
      boxShadow: {
        soft: '0 1px 2px rgba(11,12,14,0.04), 0 8px 24px -12px rgba(11,12,14,0.12)',
      },
      keyframes: {
        'progress': {
          from: { width: '0%' },
          to: { width: '100%' },
        },
        'pop-in': {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        progress: 'progress linear forwards',
        'pop-in': 'pop-in 150ms ease-out',
      },
    },
  },
  plugins: [],
}
