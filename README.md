# Mosaic

Mosaic is a production-oriented prototype for tracking movies, television, games, and books through one shared identity without flattening their domain-specific behaviors.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Use `Cmd/Ctrl + K` for universal search. On mobile, the emphasized Log action opens the domain-aware quick log sheet.

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

All data is currently stored as typed mock fixtures in `src/data/media.ts`. Provider integration, authentication, and backend persistence are intentionally outside this phase.
