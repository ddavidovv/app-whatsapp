/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-red': '#A50034',
        'brand-red-dark': '#840029',
      }
    },
  },
  plugins: [],
}
