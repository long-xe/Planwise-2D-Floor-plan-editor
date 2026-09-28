# Planwise-2D-Floor-plan-editor

Interactive floor plan editor built on the raw Canvas 2D API. React + TypeScript + Vite + Tailwind CSS v4.

## Scripts

```bash
npm install
npm run dev        # dev server
npm run test       # vitest
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production build to dist/
```

## Deploy (Vercel)

`vercel.json` configures the build (`npm run build` → `dist/`) and SPA rewrites.
Import the repo on vercel.com, or run `npx vercel` / `npx vercel --prod`.
