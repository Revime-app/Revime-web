import type { MetadataRoute } from 'next';
import { absoluteUrl } from '../lib/site';

/**
 * robots.txt. Decided 24/11/2026: search engines AND AI crawlers (search and training) are
 * allowed; only private and technical paths are closed. CSS and JS are never blocked.
 *
 * Filter and sort parameters of the directory are blocked so crawlers do not explore endless
 * combinations (Google faceted-navigation guidance).
 */
export const PRIVATE_PATHS = [
  '/api/',
  '/accueil',
  '/demande/',
  '/profil',
  '/compte',
  '/connexion',
  '/inscription',
  '/mot-de-passe-oublie',
  '/messages',
  '/notifications',
  '/favoris',
  '/publier',
  '/mes-demandes',
  '/commandes',
  '/commande/',
  '/paiement',
  '/pro/',
  '/parametres',
  '/avis/',
  '/*?*tri=',
  '/*?*filtre=',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: PRIVATE_PATHS }],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
