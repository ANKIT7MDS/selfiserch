/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#00e676',
          hover: '#00c853',
          dark: '#00b248'
        },
        dark: {
          bg: '#050505',
          card: '#101010',
          border: '#262626'
        }
      }
    },
  },
  plugins: [],
}