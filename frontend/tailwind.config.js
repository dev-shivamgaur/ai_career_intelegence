/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#2B2B2B",
        brand: {
          50: "#F4FBFA",
          100: "#E7F4F1",
          200: "#AFEEEE",
          300: "#ADEBB3",
          400: "#8AA89A",
          500: "#5C4E4E",
          600: "#2B2B2B",
          700: "#1F1F1F",
          800: "#5C4E4E",
          900: "#3A3333",
          950: "#1C1919",
        },
        surface: {
          DEFAULT: "#F3F7F6",
          card: "#FBFCFB",
          dark: "#100E0E",
          "dark-card": "#1C1919",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.06), 0 8px 24px rgba(15, 23, 42, 0.04)",
      },
    },
  },
  plugins: [],
};
