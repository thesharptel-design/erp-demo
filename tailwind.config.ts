import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef4ff',
          100: '#d9e6ff',
          200: '#bcd2ff',
          300: '#8fb3ff',
          400: '#5b8cff',
          500: '#3366ff',
          600: '#1f4fe0',
          700: '#1b43bf',
          800: '#1a3b99',
          900: '#1b367a',
        },
      },
      fontSize: {
        pageTitle: ['1.875rem', { lineHeight: '2.25rem', fontWeight: '800' }],
        sectionTitle: ['1.25rem', { lineHeight: '1.75rem', fontWeight: '700' }],
      },
      borderWidth: {
        3: '3px',
      },
      borderRadius: {
        panel: '1rem',
        field: '0.875rem',
      },
    },
  },
}

export default config
