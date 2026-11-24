// Imported by main.ts right after `dotenv/config` and before anything else, so Sentry (when
// SENTRY_DSN is set) is running before the first module that could throw is evaluated. See
// monitoring.ts for what it reports and what it strips.
import { initMonitoring } from './monitoring.js';

initMonitoring();
