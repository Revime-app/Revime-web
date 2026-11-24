import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GoogleSansFlex_400Regular, GoogleSansFlex_500Medium, GoogleSansFlex_600SemiBold, GoogleSansFlex_700Bold, useFonts } from '@expo-google-fonts/google-sans-flex';
import { SessionProvider, useSessionContext } from '../src/lib/session';
import { StepUpProvider } from '../src/lib/step-up-context';
import { QueryProvider } from '../src/lib/query';
import { ThemeProvider } from '../src/theme';
import { usePushForeground, usePushPathname, usePushResponse } from '../src/lib/push-handlers';
import { View, Text, ScrollView } from 'react-native';
import { Component, type ReactNode } from 'react';
import { authInitError } from '../src/lib/auth-client';
import { StripeProvider } from '@stripe/stripe-react-native';
import { APPLE_PAY_MERCHANT_ID } from '../src/components/payment/apple-pay';
import { RevimeStartupSplash } from '../src/components/lottie/RevimeStartupSplash';
import { MaintenanceGate } from '../src/components/MaintenanceGate';
import { TourProvider } from '../src/tour/TourProvider';
import { StatusBar } from 'expo-status-bar';
import { APP_STATUS_BAR_STYLE } from '../src/lib/status-bar';
import { initMonitoring } from '../src/lib/monitoring';

// Crash reporting first (PUB-31; off without EXPO_PUBLIC_SENTRY_DSN and in development). It must run
// before the handler below, which then chains to Sentry's through `prevGlobalHandler`.
initMonitoring();

// Module-level state for global handler
let globalError: any = null;

// Install global error handler before anything else renders
const globalAny = globalThis as any;
const prevGlobalHandler = globalAny.ErrorUtils?.getGlobalHandler?.();
globalAny.ErrorUtils?.setGlobalHandler?.((e: any, isFatal?: boolean) => {
  console.error('Global error handler caught:', e);
  globalError = e;
  // Delegate to previous handler but pass false for isFatal to prevent abort
  prevGlobalHandler?.(e, false);
});

function ErrorScreen({ error }: { error: unknown }) {
  const errorStr = String(error);
  const stack = (error as any)?.stack;
  const stackLines = stack ? String(stack).split('\n').slice(0, 25).join('\n') : null;

  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff', paddingTop: 80, paddingHorizontal: 16 }}>
      <ScrollView>
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#000000', marginBottom: 16 }} selectable>
          Startup error
        </Text>
        <Text style={{ fontSize: 14, color: '#000000', marginBottom: 16 }} selectable>
          {errorStr}
        </Text>
        {stackLines && (
          <Text style={{ fontSize: 12, fontFamily: 'monospace', color: '#000000' }} selectable>
            {stackLines}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

class StartupErrorBoundary extends Component<
  { children: ReactNode },
  { error: unknown | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown, errorInfo: any) {
    console.error('StartupErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return <ErrorScreen error={this.state.error} />;
    }
    return this.props.children;
  }
}

function AppContent({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { me, refresh, loading: sessionLoading } = useSessionContext();
  const isAppReady = fontsLoaded && !sessionLoading;
  const mode = me?.profile.activeMode === 'REPAIRER' ? 'pro' : 'client';

  // CF-44. Inside QueryProvider and SessionProvider (both wrap this component), so the hooks can
  // read the query client and the session. Spec §9.5–§9.6.
  usePushPathname();
  usePushForeground();
  usePushResponse(me, refresh);

  return (
    <ThemeProvider mode={mode}>
      {/* V8 B1 (FND8-013): dark icons on every screen, whatever the phone's theme. Without it Android
          drew white icons on our white headers in dark mode. The splash below overrides it while up. */}
      <StatusBar style={APP_STATUS_BAR_STYLE} />
      {/* V7 U2b: inside the theme, because its sheet is themed. */}
      <StepUpProvider>
        {/* V8 E2: TourProvider's help bubbles draw over every screen and under the gate's two blocking screens. */}
        {/* V7 D5 (U9): the maintenance screen and the team's banner; the navigator stays mounted under them. */}
        <MaintenanceGate>
          <TourProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
            </Stack>
          </TourProvider>
        </MaintenanceGate>
      </StepUpProvider>
      <RevimeStartupSplash isAppReady={isAppReady} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    GoogleSansFlex_400Regular,
    GoogleSansFlex_500Medium,
    GoogleSansFlex_600SemiBold,
    GoogleSansFlex_700Bold,
  });

  // Check for auth init error first
  if (authInitError) {
    return <ErrorScreen error={authInitError} />;
  }

  // Check for global error
  if (globalError) {
    return <ErrorScreen error={globalError} />;
  }

  return (
    <SafeAreaProvider>
      <StartupErrorBoundary>
        <QueryProvider>
          <SessionProvider>
            <StripeProvider
              publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''}
              merchantIdentifier={APPLE_PAY_MERCHANT_ID}
              urlScheme="revime"
            >
              <AppContent fontsLoaded={Boolean(loaded)} />
            </StripeProvider>
          </SessionProvider>
        </QueryProvider>
      </StartupErrorBoundary>
    </SafeAreaProvider>
  );
}
