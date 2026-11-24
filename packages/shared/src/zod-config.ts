import { z } from 'zod';

/**
 * zod's built-in messages are English, and Revime is French everywhere.
 * Messages authored on .min()/.regex() do NOT cover the invalid_type case, so
 * without this a missing field answers "Invalid input: expected string,
 * received undefined" directly to a user.
 *
 * Setting the locale once makes French the default for EVERY schema in the
 * project, including the auth schemas, rather than relying on remembering an
 * `error` option on each new field. Authored messages still win where present.
 *
 * Verified available in zod 4.4.3 as z.locales.fr.
 */
z.config(z.locales.fr());
