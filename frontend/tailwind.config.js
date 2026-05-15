/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#fef1f4',
          100: '#fde3e9',
          200: '#fbc7d3',
          300: '#f79bb0',
          400: '#f34d76',
          500: '#F0184A',
          600: '#F0184A',
          700: '#d4153f',
          800: '#b21235',
          900: '#940f2d',
        },
        brand: {
          red:   '#F0184A',
          hover: '#d4153f',
          black: '#1A1A1A',
          gray:  '#6B7280',
          white: '#FFFFFF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
