import { Tabs, useRouter } from 'expo-router';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useEffect, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme';
import { useSessionContext } from '../../src/lib/session';
import { usePushRegistration } from '../../src/lib/push';
import { useConversations } from '../../src/lib/queries';
import { IconHome, IconSearch, IconPlus, IconBriefcase, IconMessage, IconUser } from '../../src/icons';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { layout } from '@revime/tokens';
import { useTourTarget } from '../../src/tour/use-tour';
import { shouldRetryMe, tabGateTarget } from '../../src/lib/signup-steps';

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { palette, accent } = useTheme();
  const { me } = useSessionContext();
  const insets = useSafeAreaInsets();
  const conversations = useConversations();
  const activeMode = me?.profile.activeMode ?? 'CLIENT';
  const unreadCount = (conversations.data ?? [])
    .filter((c) => (c.userRole ? c.userRole === activeMode : true))
    .reduce((acc, c) => acc + (c.unread || 0), 0);
  // V8 E2: Accueil's « Votre espace » (client) and « Toutes les demandes » (repairer centre button).
  const profilTabTarget = useTourTarget('tabProfil');
  const fabTarget = useTourTarget('fabDemandes');

  // FAB configuration based on mode
  const fabConfig = activeMode === 'REPAIRER'
    ? {
        icon: <IconBriefcase size={26} color={palette.paper} strokeWidth={2.4} />,
        label: 'Voir les demandes',
        route: 'publier', // Placeholder route for Étape 3a
      }
    : {
        icon: <IconPlus size={28} color={palette.paper} strokeWidth={2.6} />,
        label: 'Publier une demande',
        route: 'publier', // Placeholder route for Étape 3a
      };

  const getIcon = (routeName: string, isFocused: boolean) => {
    const color = isFocused ? accent.accent : palette.faint;
    const size = 22;
    const strokeWidth = 2.2;

    switch (routeName) {
      case 'index':
        return <IconHome size={size} color={color} strokeWidth={strokeWidth} />;
      case 'recherche':
        return <IconSearch size={size} color={color} strokeWidth={strokeWidth} />;
      case 'messages':
        return (
          <View style={{ position: 'relative' }}>
            <IconMessage size={size} color={color} strokeWidth={strokeWidth} />
            {unreadCount > 0 && (
              <View
                style={{
                  position: 'absolute',
                  top: -5,
                  right: -10,
                  backgroundColor: accent.accent,
                  borderRadius: 9,
                  minWidth: 18,
                  height: 18,
                  paddingHorizontal: 4,
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderWidth: 1.5,
                  borderColor: palette.paper,
                }}
              >
                <Text
                  style={{
                    color: palette.paper,
                    fontSize: 9.5,
                    fontFamily: 'GoogleSansFlex_700Bold',
                    lineHeight: 12,
                  }}
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </View>
        );
      case 'profil':
        return <IconUser size={size} color={color} strokeWidth={strokeWidth} />;
      default:
        return null;
    }
  };

  const getLabel = (routeName: string) => {
    switch (routeName) {
      case 'index':
        return 'Accueil';
      case 'recherche':
        return 'Recherche';
      case 'messages':
        return 'Messages';
      case 'profil':
        return 'Profil';
      default:
        return '';
    }
  };

  const handleFabPress = () => {
    // Navigate to placeholder for Étape 3a
    navigation.navigate(fabConfig.route);
  };

  return (
    <View
      style={[
        styles.tabBar,
        {
          height: layout.navHeight + insets.bottom,
          paddingBottom: insets.bottom,
          backgroundColor: `${palette.paper}E6`, // 90% opacity
          borderTopColor: palette.line,
        },
      ]}
    >
      {state.routes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;

        // Skip the FAB placeholder route in the tab list
        if (route.name === 'publier') {
          return null;
        }

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        // Insert FAB between recherche and messages
        const items = [];

        items.push(
          <Pressable
            key={route.key}
            {...(route.name === 'profil' ? profilTabTarget : null)}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            onPress={onPress}
            style={styles.tabItem}
          >
            {getIcon(route.name, isFocused)}
            <Text
              style={[
                styles.tabLabel,
                {
                  color: isFocused ? palette.ink : palette.faint,
                },
              ]}
            >
              {getLabel(route.name)}
            </Text>
          </Pressable>
        );

        // After recherche (index 1), add FAB
        if (index === 1) {
          items.push(
            <Pressable
              key="fab"
              {...(activeMode === 'REPAIRER' ? fabTarget : null)}
              accessibilityRole="button"
              accessibilityLabel={fabConfig.label}
              onPress={handleFabPress}
              style={({ pressed }) => [
                styles.fab,
                {
                  backgroundColor: pressed ? accent.accentDeep : accent.accent,
                  borderColor: palette.paper,
                  shadowColor: accent.accent,
                  shadowOpacity: 0.42,
                  shadowOffset: { width: 0, height: 10 },
                  shadowRadius: 22,
                  elevation: 12,
                  transform: [{ scale: pressed ? 0.94 : 1 }],
                },
              ]}
            >
              {fabConfig.icon}
            </Pressable>
          );
        }

        return items;
      })}
    </View>
  );
}

export default function TabsLayout() {
  const router = useRouter();
  const { session, loading, me, refreshIfStale } = useSessionContext();

  // V9 B1 (final review #2): a `me` that failed to load (a cold server right after sign-in) is read
  // again every few seconds until it arrives, so the gate below can send the user to an owed step.
  const retryMe = shouldRetryMe({ session, loading, me });
  useEffect(() => {
    if (!retryMe) return;
    void refreshIfStale();
    const timer = setInterval(() => void refreshIfStale(), 6_000);
    return () => clearInterval(timer);
  }, [retryMe, refreshIfStale]);
  // CF-44. The owner's (a): the one permission prompt fires here, the first home screen after
  // sign-in, once `me` exists. Spec §9.2.
  usePushRegistration(me);

  /**
   * Session gate: no session inside the app shell means sign in.
   *
   * 🛑 This MUST match the destination `src/lib/sign-out.ts` uses. It used to send the
   * user to `/`, which is the onboarding deck, and that made sign-out non-deterministic:
   * `app/index.tsx` redirects to `(tabs)` whenever `session` is truthy while this effect
   * redirects out whenever it is falsy, so the two observed the same value and pointed at
   * each other. Both fire during sign-out, and where the user ended up depended on which
   * saw the cleared session first. Pointing both here terminates it, because
   * `/(auth)/login` reads no session state.
   *
   * Safe for a genuinely new user: reaching `(tabs)` at all requires a session, so a
   * first-time install goes `/` → onboarding and never mounts this layout. The only way to
   * arrive here without a session is to have lost one - sign-out, expiry or revocation -
   * and sign-in is the right answer for all three.
   */
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    if (!loading) {
      // V9 B1 (`FND9-017`): the completion steps an account owes come before the phone check, and are
      // re-read on every `me` load, so a slow server after a social sign-in can no longer skip them.
      const target = tabGateTarget({ session, me });
      if (target === '/(auth)/login') {
        if (!hasRedirectedRef.current) {
          hasRedirectedRef.current = true;
          router.replace('/(auth)/login');
        }
      } else if (target !== null) {
        router.replace(target);
      } else {
        // Session restored — reset the lock so a future sign-out can redirect again
        hasRedirectedRef.current = false;
      }
    }
  }, [loading, session, me, router]);

  // Don't render tabs until session is loaded
  if (loading) {
    return null;
  }

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
        }}
      />
      <Tabs.Screen
        name="recherche"
        options={{
          title: 'Recherche',
        }}
      />
      <Tabs.Screen
        name="publier"
        options={{
          title: 'Publier',
          href: null, // Hide from tab bar, accessed via FAB
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: 'Profil',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 13,
    borderTopWidth: 1,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 4,
  },
  tabLabel: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 10.5,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 4,
    marginTop: -24,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
