import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// UI nueva de motor-contactos (Fase 1) — proyecto propio, sin identidad de
// marca de Mejora Continua. Habla con la API JSON del backend Python
// (motor/api.py) que corre en :5000 vía CORS, no vía este proxy — cada uno
// en su puerto, es más simple de correr en paralelo con `motor.cli panel`.
export default defineConfig({
  plugins: [react()],
  server: {
    // 5174, no 5173: el 5173 ya lo usa el dev server de la SPA principal
    // del repo (.claude/launch.json, config "dev") — se corren en paralelo.
    port: 5174,
  },
});
