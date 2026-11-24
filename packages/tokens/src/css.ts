import { accents, palette, paletteDark, radii, semanticBadges, semanticBadgesDark, type AccentMode } from './index.js';

export function tokensCss(mode: AccentMode = 'client'): string {
  const a = accents[mode];
  const badgeVars = Object.entries(semanticBadges).flatMap(([role, values]) => [
    `--badge-${role}-text: ${values.text};`,
    `--badge-${role}-bg: ${values.bg};`,
    `--badge-${role}-border: ${values.border};`,
  ]);

  const lightVars = [
    ...Object.entries(palette).map(([k, v]) => `--${kebab(k)}: ${v};`),
    `--accent: ${a.accent};`,
    `--accent-deep: ${a.accentDeep};`,
    `--accent-soft: ${a.accentSoft};`,
    ...Object.entries(radii).map(([k, v]) => `--r-${k}: ${v}px;`),
    ...badgeVars,
  ];

  const darkBadgeVars = Object.entries(semanticBadgesDark).flatMap(([role, values]) => [
    `--badge-${role}-text: ${values.text};`,
    `--badge-${role}-bg: ${values.bg};`,
    `--badge-${role}-border: ${values.border};`,
  ]);

  const darkVars = [
    ...Object.entries(paletteDark).map(([k, v]) => `--${kebab(k)}: ${v};`),
    `--accent: ${mode === 'pro' ? paletteDark.navy : a.accent};`,
    `--accent-deep: ${mode === 'pro' ? paletteDark.navyLift : a.accentDeep};`,
    `--accent-soft: ${mode === 'pro' ? paletteDark.navySoft : a.accentSoft};`,
    ...darkBadgeVars,
  ];

  return [
    `:root {\n  ${lightVars.join('\n  ')}\n}`,
    `:root[data-theme="dark"] {\n  ${darkVars.join('\n  ')}\n}`,
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n    ${darkVars.join('\n    ')}\n  }\n}`,
  ].join('\n\n');
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
