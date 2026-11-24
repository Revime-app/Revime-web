import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * V7 A1 criterion 3 (U3): « À vérifier sur tous les formulaires ». This spec IS that audit, kept
 * current: every file under `app/` and `src/` that renders a text input either sits in the shared
 * `KeyboardAvoider` or is listed below with the reason it does not need one. A new form that forgets
 * the wrapper fails here instead of on the client's phone.
 */
const ROOT = path.resolve(__dirname, '..');
const WRAPPER_FILE = 'src/components/KeyboardAvoider.tsx';

function sources(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sources(rel);
    return entry.name.endsWith('.tsx') ? [rel] : [];
  });
}

const FILES = [...sources('app'), ...sources('src')];
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const HAS_INPUT = /<(TextInput|Field|AddressInput)\b/;
const HAS_WRAPPER = /<KeyboardAvoider\b/;

type Exemption =
  /** A component drawn inside screens that carry the wrapper; each host is checked. */
  | { file: string; component: string; renderedIn: string[] }
  /** A field the keyboard cannot reach, with the reason. */
  | { file: string; reason: string };

const EXEMPT: Exemption[] = [
  // The input primitives: every screen that draws them is checked by the HAS_INPUT match itself.
  { file: 'src/components/Field.tsx', reason: 'The labelled-input primitive; its screens are checked' },
  { file: 'src/components/AddressInput.tsx', reason: 'The address primitive; its screens are checked' },
  // Drawn inside a screen that already has the wrapper.
  { file: 'src/components/ParcelStep.tsx', component: 'ParcelStep', renderedIn: ['app/demande/[id]/paiement.tsx'] },
  {
    file: 'src/components/commande/ShippingAddressCard.tsx',
    component: 'ShippingAddressCard',
    renderedIn: ['app/commande/[id]/index.tsx'],
  },
  // A search field at the top of a list, with nothing to submit below it.
  { file: 'src/components/DemandeBrowse.tsx', reason: 'Search field at the top of the list' },
  { file: 'src/components/DemandeFeed.tsx', reason: 'Search field at the top of the list' },
  { file: 'src/components/RepairerDirectory.tsx', reason: 'Search field at the top of the list' },
  { file: 'src/components/CategorySearch.tsx', reason: 'Rendered by no screen' },
  // V9 B1 (2026-11-19): the view calls `SignupStepFrame(...)`, whose root is the KeyboardAvoider.
  {
    file: 'src/components/signup/UsernameStepView.tsx',
    reason: 'Wrapped by SignupStepFrame (src/components/signup/SignupStepFrame.tsx), called as its root',
  },
];

describe('V9 B1: the signup step frame carries the wrapper its views rely on', () => {
  it('SignupStepFrame renders the KeyboardAvoider', () => {
    expect(HAS_WRAPPER.test(read('src/components/signup/SignupStepFrame.tsx'))).toBe(true);
  });
});

describe('keyboard coverage (V7 A1 criterion 3)', () => {
  it('lets only the wrapper render a KeyboardAvoidingView, so `behavior` lives in one place', () => {
    const direct = FILES.filter((f) => f !== WRAPPER_FILE && /<KeyboardAvoidingView\b/.test(read(f)));
    expect(direct).toEqual([]);
  });

  it('wraps every file holding a text input, or names why not', () => {
    const exempt = new Set(EXEMPT.map((e) => e.file));
    const missing = FILES.filter(
      (f) => f !== WRAPPER_FILE && !exempt.has(f) && HAS_INPUT.test(read(f)) && !HAS_WRAPPER.test(read(f)),
    );
    expect(missing).toEqual([]);
  });

  it('keeps every exemption true: the file exists, holds an input and has no wrapper', () => {
    for (const e of EXEMPT) {
      const source = read(e.file);
      expect(HAS_INPUT.test(source), e.file).toBe(true);
      expect(HAS_WRAPPER.test(source), e.file).toBe(false);
    }
  });

  it('draws each exempt component only inside wrapped screens', () => {
    for (const e of EXEMPT) {
      if (!('component' in e)) continue;
      const tag = new RegExp(`<${e.component}\\b`);
      const hosts = FILES.filter((f) => f !== e.file && tag.test(read(f)));
      expect(hosts.sort(), e.component).toEqual([...e.renderedIn].sort());
      for (const host of hosts) expect(HAS_WRAPPER.test(read(host)), host).toBe(true);
    }
  });

  it('really has no screen drawing CategorySearch', () => {
    expect(FILES.filter((f) => /<CategorySearch\b/.test(read(f)))).toEqual([]);
  });
});
