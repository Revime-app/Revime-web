/**
 * Platinum, the fifth colour in `CHARTE_GRAPHIQUE_REVIME_VF.pdf`. The charte lists it without
 * assigning a role; it is the palette's light neutral, so it also serves as `line`. Declared
 * ahead of `palette` so the two share one literal and cannot drift apart.
 */
const platinum = '#dfe2e2';

/**
 * The client's brand charter is the authority for the five values it names - Rouge Punch,
 * Bleu Ink, Bleu prusse, Blanc and Platinum. It supersedes chapter 7 of the cahier des
 * charges, which is what the web prototype's `:root` still carries (`styles.css:2`).
 *
 * Everything else here is either DERIVED from a charte colour or a functional neutral the
 * charte does not govern. The charte says unlisted colours are « formellement proscrite »,
 * which is a statement about brand surfaces; a UI still needs pressed states, tinted grounds
 * and success/warning semantics, and five colours cannot express « acceptée » versus « en
 * attente ». Derived values keep the hue and reuse the tonal step the design system already
 * encoded, so they read as the same family rather than as new colours.
 */
export const palette = {
  /** Rouge Punch. The charte gives it action and « la proximité du particulier ». */
  red: '#f61b39',
  /** Derived from Rouge Punch with the step the system already used for #e53935 -> #c62828. */
  redDeep: '#bd0e26',
  /** Derived from Rouge Punch at the lightness and saturation #fdecee held. */
  redSoft: '#feedf0',
  /** Bleu Ink. The charte gives it « la fiabilité et l'expertise du professionnel ». */
  navy: '#25324f',
  /** Bleu prusse. CHARTE-GIVEN, not derived - the charte names it for dark grounds. */
  navyDeep: '#010524',
  /** Derived from Bleu Ink at the lightness and saturation #eef0f4 held. */
  navySoft: '#f0f1f5',
  /**
   * Lifted blue that reads against navy. The prototype hardcodes #2f4a8c on
   * `.role2--pro .role2__go` (styles.css:739) and it has no CSS variable there, so it is
   * promoted to a token here rather than inlined into a screen.
   *
   * 🛑 **This value is NOT the prototype's.** #2f4a8c was tuned against the old navy
   * (#111827) where it separated at 2.09:1. Bleu Ink is much lighter, and against it the
   * prototype's blue collapses to **1.50:1** - the button all but disappears. #3b5fb0 is
   * the same hue at the lightness that restores 2.09:1 against #25324f. Re-derive it if
   * `navy` ever moves again; do not copy it back from the prototype.
   */
  navyLift: '#3b5fb0',
  ink: '#141414',
  ink2: '#2b2b2e',
  muted: '#6b7280',
  faint: '#9ca3af',
  /** Blanc. The charte's light-mode base. */
  paper: '#ffffff',
  page: '#f9fafb',
  mist: '#f6f5f3',
  /** Platinum. See the declaration above - `line` and `platinum` are one value. */
  platinum,
  line: platinum,
  green: '#12b76a',
  greenDeep: '#0a8a50',
  greenSoft: '#e7f8f0',
  amber: '#f79009',
  amberDeep: '#b45309',
  amberSoft: '#fef3e6',
} as const;

/** Réparateur mode repaints the accent navy - see prototype `[data-mode="pro"]`. */
export const accents = {
  client: {
    accent: palette.red,
    accentDeep: palette.redDeep,
    accentSoft: palette.redSoft,
    /** Rouge Punch at 42%. Kept in step with `accent` by hand - rgba() cannot read a token. */
    fabShadow: 'rgba(246, 27, 57, 0.42)',
  },
  pro: {
    accent: palette.navy,
    accentDeep: palette.navyDeep,
    accentSoft: palette.navySoft,
    /** Bleu Ink at 42%. Kept in step with `accent` by hand - rgba() cannot read a token. */
    fabShadow: 'rgba(37, 50, 79, 0.42)',
  },
} as const;

export const radii = { lg: 24, card: 20, field: 14, pill: 999 } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/**
 * 🛑 **Mostly vestigial - do not assume editing this repaints anything.** Measured
 * 2026-08-20: across mobile and admin, only `.size` is ever read (37 call sites).
 * `.lineHeight` is read **once** (`app/avis/[commandeId].tsx:125`), and `.weight` and the
 * whole `price` entry are read **zero** times. Every other size, line-height and letter
 * spacing in the app is hardcoded at its call site - 359 `fontSize` literals in 52 files and 24
 * `letterSpacing` in 16.
 *
 * So the charte's type hierarchy cannot be applied here. Adding its tracking to this block
 * would compile, typecheck, and render nothing.
 */
export const type = {
  screenTitle: { size: 26, weight: '700' as const, lineHeight: 32 },
  section: { size: 19, weight: '700' as const, lineHeight: 26 },
  body: { size: 15, weight: '500' as const, lineHeight: 22 },
  caption: { size: 12, weight: '500' as const, lineHeight: 16 },
  price: { size: 21, weight: '700' as const, lineHeight: 26 },
} as const;

/**
 * Google Sans Flex, the charte's primary typeface. Its fallback clause - « n'importe quelle
 * police sans-serif système », recommending Arial or Helvetica - needs no expression here:
 * React Native already falls back to the platform sans when a family fails to load.
 *
 * 🛑 **Nothing reads this token** (zero call sites, 2026-08-20). The app names its weights
 * inline at 394 call sites instead. It is corrected here so it does not assert a typeface
 * the app stopped using, not because changing it has any effect.
 */
export const fontFamily = {
  display: 'GoogleSansFlex_700Bold',
  body: 'GoogleSansFlex_500Medium',
} as const;

export const layout = { navHeight: 78 } as const;

/**
 * Semantic status badge design tokens.
 * Functional color sets providing AA contrast on tinted backgrounds for status badges.
 */
export const semanticBadges = {
  success: {
    text: '#027a48',
    bg: '#ecfdf3',
    border: '#a6f4c5',
  },
  warning: {
    text: '#b54708',
    bg: '#fffaeb',
    border: '#fedf89',
  },
  info: {
    text: '#1d4ed8',
    bg: '#eff6ff',
    border: '#bfdbfe',
  },
  danger: {
    text: '#b42318',
    bg: '#fef3f2',
    border: '#fecdca',
  },
  neutral: {
    text: '#344054',
    bg: '#f8f9fa',
    border: '#eaecf0',
  },
} as const;

/**
 * Dark palette for admin surfaces (CG-8).
 * Base canvas is Bleu prusse (#010524), elevated surfaces are Lifted Dark Navy (#0d1645).
 */
export const paletteDark = {
  red: '#f61b39',
  redDeep: '#bd0e26',
  redSoft: 'rgba(246, 27, 57, 0.15)',
  navy: '#3b5fb0',
  navyDeep: '#010524',
  navySoft: 'rgba(59, 130, 246, 0.15)',
  navyLift: '#4b72cb',
  ink: '#f8fafc',
  ink2: '#e2e8f0',
  muted: '#94a3b8',
  faint: '#64748b',
  paper: '#0d1645',
  page: '#010524',
  mist: '#070c2a',
  platinum: 'rgba(255, 255, 255, 0.09)',
  line: 'rgba(255, 255, 255, 0.09)',
  green: '#4ade80',
  greenDeep: '#22c55e',
  greenSoft: 'rgba(34, 197, 94, 0.15)',
  amber: '#fbbf24',
  amberDeep: '#f59e0b',
  amberSoft: 'rgba(245, 158, 11, 0.15)',
} as const;

/**
 * Semantic status badge design tokens for dark mode.
 * Translucent backgrounds with high-contrast text conforming to WCAG AA/AAA.
 */
export const semanticBadgesDark = {
  success: {
    text: '#4ade80',
    bg: 'rgba(34, 197, 94, 0.15)',
    border: 'rgba(34, 197, 94, 0.3)',
  },
  warning: {
    text: '#fbbf24',
    bg: 'rgba(245, 158, 11, 0.15)',
    border: 'rgba(245, 158, 11, 0.3)',
  },
  info: {
    text: '#60a5fa',
    bg: 'rgba(59, 130, 246, 0.15)',
    border: 'rgba(59, 130, 246, 0.3)',
  },
  danger: {
    text: '#f87171',
    bg: 'rgba(239, 68, 68, 0.15)',
    border: 'rgba(239, 68, 68, 0.3)',
  },
  neutral: {
    text: '#cbd5e1',
    bg: 'rgba(148, 163, 184, 0.15)',
    border: 'rgba(148, 163, 184, 0.3)',
  },
} as const;

export type SemanticBadgeRole = keyof typeof semanticBadges;

export type AccentMode = keyof typeof accents;

