/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#fff0f3',
          100: '#ffe0e8',
          200: '#ffc1d1',
          300: '#ff93ae',
          400: '#ff5580',
          500: '#FC2B5F',
          600: '#FC2B5F',
          700: '#EB265D',
          800: '#c41e4e',
          900: '#a01a42',
        },
        brand: {
          red:   '#FC2B5F',
          hover: '#EB265D',
          black: '#000000',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
