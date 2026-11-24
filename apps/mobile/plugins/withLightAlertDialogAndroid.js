const { withAndroidStyles, createRunOncePlugin } = require('expo/config-plugins');

const pkg = { name: 'withLightAlertDialogAndroid', version: '1.0.0' };

/**
 * V8 `ISS8-019` (B1 criterion 3). React Native's `Alert` is an AppCompat `AlertDialog` built on the
 * activity theme, which `withStripeIdentityAndroid` makes `Theme.MaterialComponents.DayNight.NoActionBar`.
 * In Android dark mode the dialog therefore turns dark (`#424242`) while its buttons keep `colorPrimary`,
 * which `app.json` never sets, so Expo writes its default `#023c69` (`@expo/config-plugins`
 * `PrimaryColor.js`): 1.13:1, measured on the emulator 2026-11-18.
 *
 * The app is pinned light everywhere else (`FND8-009`, `DEC8-03`), so the dialogs are pinned light too:
 * `AppTheme`'s `alertDialogTheme` points at a light Material alert style whose buttons use the charte's
 * Bleu Ink (`palette.navy`, `#25324f`, 12.6:1 on white). `expo-system-ui` stays out (`DEC8-03`).
 * A native change: it reaches a phone only with a new build.
 */
const ALERT_DIALOG_STYLE = 'RevimeAlertDialog';
const ALERT_DIALOG_PARENT = 'Theme.MaterialComponents.Light.Dialog.Alert';
// `palette.navy` in @revime/tokens (light set); the spec checks they are equal.
const BUTTON_COLOR = '#25324f';

/**
 * Seen on APK `c6fa548c` (2026-11-18): with the dialog light, its TITLE was white on white in dark mode.
 * React Native replaces the title with its own view (`AlertFragment.getAccessibleTitle`), inflated with
 * `LayoutInflater.from(activityContext)` from `alert_title_layout.xml`, whose style is
 * `?android:attr/windowTitleStyle`: resolved against the ACTIVITY theme (DayNight), not the dialog's.
 * So `AppTheme`'s `android:windowTitleStyle` gets a fixed dark title colour (`palette.navyDeep`, the
 * charte's Bleu prusse, the app's text colour). The activity itself has no title bar (NoActionBar).
 */
const ALERT_TITLE_STYLE = 'RevimeAlertTitle';
const ALERT_TITLE_PARENT = 'TextAppearance.AppCompat.Title';
const TITLE_COLOR = '#010524';

function setItem(style, name, value) {
  const items = Array.isArray(style.item) ? style.item : style.item ? [style.item] : [];
  style.item = items.filter((i) => !(i.$ && i.$.name === name));
  style.item.push({ $: { name }, _: value });
}

function mutateAlertDialogStyles(xml) {
  if (!xml.resources) xml.resources = {};
  const list = xml.resources.style;
  xml.resources.style = Array.isArray(list) ? list : list ? [list] : [];
  const all = xml.resources.style;

  let appTheme = all.find((s) => s.$ && s.$.name === 'AppTheme');
  if (!appTheme) {
    appTheme = { $: { name: 'AppTheme' } };
    all.push(appTheme);
  }
  setItem(appTheme, 'alertDialogTheme', `@style/${ALERT_DIALOG_STYLE}`);

  let dialog = all.find((s) => s.$ && s.$.name === ALERT_DIALOG_STYLE);
  if (!dialog) {
    dialog = { $: { name: ALERT_DIALOG_STYLE, parent: ALERT_DIALOG_PARENT } };
    all.push(dialog);
  }
  dialog.$.parent = ALERT_DIALOG_PARENT;
  setItem(dialog, 'colorPrimary', BUTTON_COLOR);
  setItem(dialog, 'colorAccent', BUTTON_COLOR);

  setItem(appTheme, 'android:windowTitleStyle', `@style/${ALERT_TITLE_STYLE}`);
  let title = all.find((s) => s.$ && s.$.name === ALERT_TITLE_STYLE);
  if (!title) {
    title = { $: { name: ALERT_TITLE_STYLE, parent: ALERT_TITLE_PARENT } };
    all.push(title);
  }
  title.$.parent = ALERT_TITLE_PARENT;
  setItem(title, 'android:textColor', TITLE_COLOR);
  return xml;
}

function withLightAlertDialogAndroid(config) {
  return withAndroidStyles(config, (stylesConfig) => {
    stylesConfig.modResults = mutateAlertDialogStyles(stylesConfig.modResults);
    return stylesConfig;
  });
}

module.exports = createRunOncePlugin(withLightAlertDialogAndroid, pkg.name, pkg.version);
module.exports.mutateAlertDialogStyles = mutateAlertDialogStyles;
module.exports.ALERT_DIALOG_STYLE = ALERT_DIALOG_STYLE;
module.exports.ALERT_TITLE_STYLE = ALERT_TITLE_STYLE;
