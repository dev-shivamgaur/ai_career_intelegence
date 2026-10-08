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
        ink: "#1c1917",
        brand: {
          50: "#f4f7f5",
          100: "#e6eee9",
          200: "#c9d9cf",
          300: "#a3bfad",
          400: "#739883",
          500: "#527864",
          600: "#3d5e4d",
          700: "#2a4538",
          800: "#243830",
          900: "#1c2c26",
        },
        surface: {
          DEFAULT: "#f6f5f2",
          dark: "#121614",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.06), 0 8px 24px rgba(15, 23, 42, 0.04)",
      },
    },
  },
  plugins: [],
};
