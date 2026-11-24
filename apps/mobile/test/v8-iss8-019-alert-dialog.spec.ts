import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { palette } from '@revime/tokens';
import { mutateAlertDialogStyles, ALERT_DIALOG_STYLE, ALERT_TITLE_STYLE } from '../plugins/withLightAlertDialogAndroid';

/**
 * V8 `ISS8-019` (B1 criterion 3), found on the emulator with APK `50dbdfa8`: in Android dark mode a
 * native `Alert` draws a dark dialog (`#424242`) while its buttons keep the theme's `colorPrimary`,
 * Expo's default `#023c69` (`@expo/config-plugins` `PrimaryColor.js`): 1.13:1, near-invisible.
 * The app is pinned light everywhere else, so its dialogs are pinned light too: `AppTheme`'s
 * `alertDialogTheme` points at a light Material alert style whose buttons use the charte's Bleu Ink.
 */

type Item = { $: { name: string }; _: string };
type Style = { $: { name: string; parent?: string }; item?: Item[] };
const appTheme = (): Style => ({
  $: { name: 'AppTheme', parent: 'Theme.MaterialComponents.DayNight.NoActionBar' },
  item: [{ $: { name: 'colorPrimary' }, _: '@color/colorPrimary' }],
});
const styles = (list: Style[]) => ({ resources: { style: list } });
const find = (xml: { resources: { style: Style[] } }, name: string) => xml.resources.style.find((s) => s.$.name === name);
const itemOf = (s: Style | undefined, name: string) => s?.item?.filter((i) => i.$.name === name) ?? [];

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

describe('withLightAlertDialogAndroid (ISS8-019)', () => {
  it('points AppTheme at the light alert dialog style, keeping its parent', () => {
    const xml = mutateAlertDialogStyles(styles([appTheme()]));
    const theme = find(xml, 'AppTheme');
    expect(theme?.$.parent).toBe('Theme.MaterialComponents.DayNight.NoActionBar');
    expect(itemOf(theme, 'alertDialogTheme').map((i) => i._)).toEqual([`@style/${ALERT_DIALOG_STYLE}`]);
  });

  it('defines that style as a LIGHT Material alert dialog with Bleu Ink buttons', () => {
    const xml = mutateAlertDialogStyles(styles([appTheme()]));
    const dialog = find(xml, ALERT_DIALOG_STYLE);
    expect(dialog?.$.parent).toBe('Theme.MaterialComponents.Light.Dialog.Alert');
    expect(itemOf(dialog, 'colorPrimary').map((i) => i._)).toEqual([palette.navy]);
    expect(itemOf(dialog, 'colorAccent').map((i) => i._)).toEqual([palette.navy]);
  });

  it('gives the title a fixed dark colour: React Native inflates it from the ACTIVITY theme (seen white on white, APK c6fa548c)', () => {
    // AlertFragment.getAccessibleTitle inflates alert_title_layout.xml with LayoutInflater.from(activityContext);
    // its style is ?android:attr/windowTitleStyle, resolved against AppTheme (DayNight), so dark mode drew it white.
    const xml = mutateAlertDialogStyles(styles([appTheme()]));
    expect(itemOf(find(xml, 'AppTheme'), 'android:windowTitleStyle').map((i) => i._)).toEqual([`@style/${ALERT_TITLE_STYLE}`]);
    const title = find(xml, ALERT_TITLE_STYLE);
    expect(title?.$.parent).toBe('TextAppearance.AppCompat.Title');
    expect(itemOf(title, 'android:textColor').map((i) => i._)).toEqual([palette.navyDeep]);
  });

  it('gives the buttons at least 4.5:1 on the white dialog', () => {
    const contrast = (1 + 0.05) / (luminance(palette.navy) + 0.05);
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });

  it('is idempotent: running twice adds nothing twice', () => {
    const xml = mutateAlertDialogStyles(mutateAlertDialogStyles(styles([appTheme()])));
    expect(xml.resources.style.filter((s: Style) => s.$.name === ALERT_DIALOG_STYLE)).toHaveLength(1);
    expect(itemOf(find(xml, 'AppTheme'), 'alertDialogTheme')).toHaveLength(1);
    expect(xml.resources.style.filter((s: Style) => s.$.name === ALERT_TITLE_STYLE)).toHaveLength(1);
  });

  it('is registered in app.json after the Stripe Identity plugin (which sets AppTheme’s parent)', () => {
    const app = JSON.parse(readFileSync(resolve(__dirname, '../app.json'), 'utf8')) as { expo: { plugins: unknown[] } };
    const names = app.expo.plugins.map((p) => (Array.isArray(p) ? p[0] : p));
    const stripe = names.indexOf('./plugins/withStripeIdentityAndroid.js');
    const dialog = names.indexOf('./plugins/withLightAlertDialogAndroid.js');
    expect(dialog).toBeGreaterThan(-1);
    expect(dialog).toBeGreaterThan(stripe);
  });
});
