import { copyFile, writeFile } from 'node:fs/promises';
// GitHub Pages has no SPA rewrite. Its 404 document loads the same app, whose
// base-aware routes keep the concept viewer and lab usable on direct visits.
await copyFile('dist/index.html', 'dist/404.html');
await writeFile('dist/.nojekyll', '');
