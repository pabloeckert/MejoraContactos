/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Paleta neutra propia — a propósito NO es la identidad de marca
        // de Mejora Continua (motor-contactos es un proyecto separado y
        // privado). Grises fríos + un acento único.
        accent: {
          DEFAULT: "#3B5BDB",
          hover: "#2F4BC2",
        },
      },
    },
  },
  plugins: [],
};
