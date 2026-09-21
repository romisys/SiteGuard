# SiteGuard frontend

React + Vite + TypeScript + Tailwind v4. Talks to the backend at `/api` (proxied to `http://localhost:8000` in dev).

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # vitest (jsdom + msw)
npx tsc -p tsconfig.app.json --noEmit
npm run build
```

Routes: `/` dashboard · `/new` upload · `/analyses/:id` report (auto-polls while processing; "Download PDF" uses the browser print dialog with a print stylesheet).

Design tokens live in `src/index.css` (`@theme` block + `.dark` overrides). Risk levels are always rendered as text + icon, never color alone.
