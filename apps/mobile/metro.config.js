// Expo's default Metro config, wrapped by Sentry's serializer so every bundle and its source map
// share a debug id (REVIME_APP_PUBLICATION_PREPARATION.md PUB-31). Without it, a crash report from the
// store build cannot be matched to readable source. Nothing else changes: getSentryExpoConfig calls
// expo/metro-config's getDefaultConfig, which already handles this monorepo.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
