# 🤝 Contribuir a MejoraContactos

¡Gracias por tu interés en contribuir!

## Desarrollo

```bash
git clone https://github.com/pabloeckert/MejoraContactos.git
cd MejoraContactos
npm install --legacy-peer-deps
npm run dev          # http://localhost:8080
```

## Convenciones

- **Commits:** `tipo: descripción` (feat, fix, docs, chore, ci, perf)
  - `feat:` → nueva funcionalidad (bump minor)
  - `fix:` → bug fix (bump patch)
  - `docs:` → documentación
  - `chore:` → mantenimiento
  - `ci:` → cambios en CI/CD
  - `perf:` → mejora de performance
- **Branches:** `feature/nombre`, `fix/nombre`, `docs/nombre`
- **Tests:** Todos los PRs deben pasar `npm test` (301+ tests)
- **Lint:** `npm run lint` debe pasar sin errores (0 errors, warnings pre-existentes OK)

## Branching Strategy

| Branch | Deploy | URL | Uso |
|--------|--------|-----|-----|
| `main` | ✅ Producción | https://pabloeckert.github.io/MejoraContactos/ | Releases estables |
| `feature/*` | ❌ | — | Desarrollo local |

### Flujo de trabajo

1. Crear branch desde `main`: `git checkout -b feature/mi-feature`
2. Hacer commits con convención
3. Push y abrir PR a `main`
4. Cuando esté listo: mergear PR a `main` (deploy automático a GitHub Pages)

## Pull Requests

1. Fork el repo
2. Crear una branch desde `main`
3. Hacer cambios
4. Asegurar que `npm test` pasa (301+ tests)
5. Asegurar que `npm run lint` pasa (0 errors)
6. Asegurar que `npm run build` funciona
7. Abrir PR con descripción clara

### PR Template

```markdown
## Descripción
[Qué hace este PR]

## Tipo de cambio
- [ ] Bug fix
- [ ] Nueva funcionalidad
- [ ] Documentación
- [ ] Performance
- [ ] Refactor

## Tests
- [ ] Tests nuevos agregados
- [ ] Todos los tests pasan (npm test)
- [ ] Lint pasa (npm run lint)

## Checklist
- [ ] Código revisado
- [ ] Documentación actualizada si aplica
- [ ] CHANGELOG.md actualizado
```

## Testing

```bash
npm test                    # 301 unit tests (Vitest)
npm run test:e2e           # 21 E2E tests (Playwright)
npm run test:coverage      # Con coverage report
```

## Áreas de contribución

- 🐛 Bug fixes
- ✨ Nuevas funcionalidades
- 📝 Documentación
- 🌍 Traducciones (i18n) — actualmente ES/EN
- 🧪 Tests — especialmente Edge Functions
- ⚡ Performance
- 🔒 Seguridad

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite 5 + TypeScript |
| UI | Tailwind CSS + shadcn/ui (Radix) |
| Persistencia | IndexedDB via `idb` |
| Backend (IA) | Supabase Edge Functions (Deno) |
| Tests | Vitest + Playwright |
| CI/CD | GitHub Actions → GitHub Pages |

## Contacto

- GitHub Issues para bugs y features
- GitHub Discussions para preguntas
- SECURITY.md para reportar vulnerabilidades (no usar Issues)
