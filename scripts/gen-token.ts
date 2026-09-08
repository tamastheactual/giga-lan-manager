// Generate an instance admin token: the one secret that decides who may create
// tournaments on this server. Uses the same generator as the per-tournament
// admin keys so there is one source of randomness, not two.
import { generateAdminKey, looksLowEntropy } from '../shared/access.js';

const token = generateAdminKey();
if (looksLowEntropy(token)) throw new Error('generator produced a weak token');

console.log(`
  Admin token
  ───────────
  ${token}

  Set it on the server:

    ADMIN_TOKEN='${token}' npm run start:server

  or in a .env file beside docker-compose.yml:

    ADMIN_TOKEN=${token}

  Then open this once in the browser you organise from - it stores the token
  and strips it back out of the URL:

    https://your-host/admin/${token}

  Keep it secret. Anyone holding it can create tournaments here.
`);
