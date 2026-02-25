const { fontFamily } = require('tailwindcss/defaultTheme')

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './app/**/*.{js,ts,jsx,tsx}',
    './node_modules/flowbite/**/*.js',
    './node_modules/flowbite-react/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#135bec',
        accent: '#F0B90B',
        success: '#16C784',
        'text-main': '#0B1426',
        'text-muted': '#6B7280',
        surface: '#F8FAFC',
        card: '#FFFFFF',
        'border-strong': '#E5E7EB',
        'background-light': '#f6f6f8',
        'background-dark': '#101622',
      },
      fontFamily: {
        sans: ['var(--font-display)', ...fontFamily.sans],
        display: ['var(--font-display)', ...fontFamily.sans],
      },
      keyframes: {
        'accordion-down': {
          from: { height: 0 },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: 0 },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('flowbite/plugin'), require('tailwindcss-animate')],
}
