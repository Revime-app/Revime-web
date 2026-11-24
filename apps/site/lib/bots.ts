/**
 * User agents that must receive complete `<head>` metadata in the first HTML response.
 *
 * Next.js streams `generateMetadata` results for dynamic pages, except for the user agents in
 * `htmlLimitedBots`. Setting that option REPLACES Next's default list, so the default is copied
 * here verbatim (next 16.2, `HTML_LIMITED_BOT_UA_RE`) and the AI crawlers that do not run
 * JavaScript are added: they would otherwise miss the title, description and canonical.
 */
const NEXT_DEFAULT_LIMITED_BOTS =
  '[\\w-]+-Google|Google-[\\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight';

export const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Perplexity-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'CCBot',
  'Amazonbot',
  'Applebot-Extended',
  'meta-externalagent',
  'MistralAI-User',
] as const;

export const HTML_LIMITED_BOTS = new RegExp(`${NEXT_DEFAULT_LIMITED_BOTS}|${AI_CRAWLERS.join('|')}`, 'i');
