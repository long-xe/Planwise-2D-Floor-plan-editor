# Planwise-2D-Floor-plan-editor

Interactive floor plan editor built on the raw Canvas 2D API. React + TypeScript + Vite + Tailwind CSS v4.

## Scripts

```bash
yarn install      # yarn.lock is the lockfile (Vercel uses --frozen-lockfile)
npm run dev        # dev server
npm run test       # vitest
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production build to dist/
npm run lint       # oxlint (TS 7 has no JS API, so typescript-eslint can't run)
npm run format     # prettier --write (Tailwind class order included)
```

## Deploy (Vercel)

`vercel.json` configures the build (`npm run build` → `dist/`) and SPA rewrites.
Import the repo on vercel.com, or run `npx vercel` / `npx vercel --prod`.
