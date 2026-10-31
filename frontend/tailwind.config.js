/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Primary accent — green, matching the Figma design
        primary: {
          50: '#EAF6EC',
          100: '#CDE9D3',
          200: '#A6D6B1',
          300: '#78C08B',
          400: '#54AE6C',
          500: '#43A047',
          600: '#3B8E40',
          700: '#2F7233',
          800: '#265C2A',
          900: '#1C4720',
        },
        surface: {
          bg: '#FFFFFF',
          card: '#FFFFFF',
          subtle: '#F4F5F6',
        },
        content: {
          primary: '#1C1D1F',
          secondary: '#8A8F98',
        },
        // Status pills from the design
        schedule: {
          bg: '#FFF4E6',
          fg: '#D97B1E',
        },
        sent: {
          bg: '#EFF1F3',
          fg: '#5B6676',
        },
        success: '#43A047',
        warning: '#D97B1E',
        error: '#E5484D',
        border: '#ECEDEF',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"DM Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
