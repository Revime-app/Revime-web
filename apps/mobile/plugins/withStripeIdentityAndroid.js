const fs = require('fs');
const path = require('path');
const {
  withAndroidStyles,
  withAndroidManifest,
  withDangerousMod,
  createRunOncePlugin,
} = require('expo/config-plugins');

const pkg = { name: 'withStripeIdentityAndroid', version: '1.0.0' };

// Drawable name the Stripe Identity sheet looks up by string. The same literal is passed as
// `brandLogo.uri` on Android in src/lib/use-identity-start.ts: change both together.
const BRAND_LOGO_DRAWABLE = 'revime_brand_logo';

function mutateStyles(xml) {
  if (!xml.resources) {
    xml.resources = {};
  }
  if (!xml.resources.style) {
    xml.resources.style = [];
  } else if (!Array.isArray(xml.resources.style)) {
    xml.resources.style = [xml.resources.style];
  }

  let appTheme = xml.resources.style.find(
    (s) => s.$ && s.$.name === 'AppTheme'
  );

  if (appTheme) {
    appTheme.$.parent = 'Theme.MaterialComponents.DayNight.NoActionBar';
  } else {
    appTheme = {
      $: {
        name: 'AppTheme',
        parent: 'Theme.MaterialComponents.DayNight.NoActionBar',
      },
    };
    xml.resources.style.push(appTheme);
  }

  return xml;
}

function mutateManifest(manifest) {
  manifest['uses-permission'] = manifest['uses-permission'] || [];

  const hasCamera = manifest['uses-permission'].some(
    (p) => p.$ && p.$['android:name'] === 'android.permission.CAMERA'
  );
  if (!hasCamera) {
    manifest['uses-permission'].push({
      $: { 'android:name': 'android.permission.CAMERA' },
    });
  }

  manifest['uses-feature'] = manifest['uses-feature'] || [];
  const hasCameraFeature = manifest['uses-feature'].some(
    (f) => f.$ && f.$['android:name'] === 'android.hardware.camera'
  );
  if (!hasCameraFeature) {
    manifest['uses-feature'].push({
      $: {
        'android:name': 'android.hardware.camera',
        'android:required': 'false',
      },
    });
  }

  return manifest;
}

/**
 * Ensures AppTheme inherits from Theme.MaterialComponents on Android.
 * Stripe Identity SDK strictly requires Theme.MaterialComponents to prevent native crashes.
 */
function withMaterialThemeStyles(config) {
  return withAndroidStyles(config, (stylesConfig) => {
    stylesConfig.modResults = mutateStyles(stylesConfig.modResults);
    return stylesConfig;
  });
}

/**
 * Copies assets/icon.png into <platformProjectRoot>/app/src/main/res/drawable/revime_brand_logo.png.
 * In Release APKs, React Native does not bundle assets into res/drawable by default.
 * Passing a non-existent drawable to Stripe Identity causes Resources$NotFoundException.
 *
 * Throws when the icon is missing: use-identity-start.ts passes the drawable name unconditionally on
 * Android, so a warn-and-skip here would ship a build that crashes on the first identity verification.
 * Failing the prebuild is the only place that mistake is cheap.
 */
function copyBrandLogoDrawable({ projectRoot, platformProjectRoot }) {
  const iconSource = path.join(projectRoot, 'assets', 'icon.png');
  if (!fs.existsSync(iconSource)) {
    throw new Error(
      `[withStripeIdentityAndroid] Icon file not found at ${iconSource}. The ${BRAND_LOGO_DRAWABLE} drawable cannot be generated, and Stripe Identity would crash on Android without it.`
    );
  }
  const resDrawableDir = path.join(
    platformProjectRoot,
    'app',
    'src',
    'main',
    'res',
    'drawable'
  );
  fs.mkdirSync(resDrawableDir, { recursive: true });
  fs.copyFileSync(
    iconSource,
    path.join(resDrawableDir, `${BRAND_LOGO_DRAWABLE}.png`)
  );
}

function withBrandLogoDrawable(config) {
  return withDangerousMod(config, [
    'android',
    async (dangerousConfig) => {
      copyBrandLogoDrawable(dangerousConfig.modRequest);
      return dangerousConfig;
    },
  ]);
}

/**
 * Ensures android.permission.CAMERA and camera hardware feature exist in AndroidManifest.xml.
 */
function withCameraPermission(config) {
  return withAndroidManifest(config, (manifestConfig) => {
    manifestConfig.modResults.manifest = mutateManifest(
      manifestConfig.modResults.manifest
    );
    return manifestConfig;
  });
}

function withStripeIdentityAndroid(config) {
  config = withMaterialThemeStyles(config);
  config = withBrandLogoDrawable(config);
  config = withCameraPermission(config);
  return config;
}

module.exports = createRunOncePlugin(
  withStripeIdentityAndroid,
  pkg.name,
  pkg.version
);
module.exports.mutateStyles = mutateStyles;
module.exports.mutateManifest = mutateManifest;
module.exports.copyBrandLogoDrawable = copyBrandLogoDrawable;
module.exports.withMaterialThemeStyles = withMaterialThemeStyles;
module.exports.withBrandLogoDrawable = withBrandLogoDrawable;
module.exports.withCameraPermission = withCameraPermission;
