// @ts-check
import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  site: 'https://cactussamara.com', // domaine acheté sur GoDaddy
  // Pages statiques (output par défaut) ; seules les routes /api/* tournent côté serveur
  // (`export const prerender = false`) — elles détiennent la clé API Worco.
  adapter: vercel(),
  env: {
    schema: {
      // `secret` + `server` : lues à l'exécution, jamais incluses dans le code envoyé au navigateur.
      // Vides → mode simulation (voir src/lib/worco.ts et .env.example).
      WORCO_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      WORCO_BASE_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Envoi des emails (demandes de tour) via le Gmail de Cactus — vides → emails simulés (logs serveur)
      GMAIL_USER: envField.string({ context: 'server', access: 'secret', optional: true }),
      GMAIL_APP_PASSWORD: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
});
