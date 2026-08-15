/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Identidad de marca Mejora Continua (pedido explícito del
        // usuario, 2026-08-13 — revierte la decisión anterior de mantener
        // motor-contactos sin marca). Azul primario, rojo/amarillo como
        // acento puntual — nunca como fondo dominante de una pieza
        // completa (regla del manual: "mucho blanco, color como
        // puntuación").
        accent: {
          DEFAULT: "#1A3D84",
          hover: "#142f66",
        },
        marca: {
          azul: "#1A3D84",
          rojo: "#E1061E",
          amarillo: "#F7CC13",
          tinta: "#2B2B2B",
        },
      },
      fontFamily: {
        sans: ["League Spartan", "Inter", "-apple-system", "Segoe UI", "sans-serif"],
        marca: ["Bw Modelica", "League Spartan", "Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
