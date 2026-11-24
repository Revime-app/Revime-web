import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  ScrollView,
  ScrollViewProps,
  RefreshControl,
  View,
  StyleSheet,
  Animated,
} from 'react-native';
import { RevimeLottie } from './lottie/RevimeLottie';
import { LottieAnimationType } from '../lib/lottie-assets';

export interface RevimeRefreshScrollViewProps extends ScrollViewProps {
  /**
   * 🛑 CF6-05 / CF6-08. There is deliberately NO `refreshing` prop. The spinner shows from the
   * user's pull until THIS promise settles, never while a query refetches in the background: the
   * confirmation screen polls every 2 s, and a spinner bound to `isRefetching` flashed and snapped
   * the scroll view on every poll. With the prop gone, binding it to `isRefetching` no longer
   * compiles anywhere. It must return the promise (`() => query.refetch()`); `void query.refetch()`
   * returns undefined and does not compile either, because the spinner would vanish at once.
   */
  onRefresh?: () => Promise<unknown>;
  loaderVariant?: LottieAnimationType;
  loaderSize?: number;
}

/**
 * RevimeRefreshScrollView wraps ScrollView with an integrated REVIME Lottie loader
 * replacing the native iOS/Android refresh spinner.
 *
 * It attaches a native RefreshControl with transparent tint to preserve native pull-down
 * physics, haptic thresholds, and snap-back behaviors, while rendering an animated brand
 * loader in the pulled header space.
 */
export const RevimeRefreshScrollView = React.forwardRef<ScrollView, RevimeRefreshScrollViewProps>(
  function RevimeRefreshScrollView(
    {
      onRefresh,
      loaderVariant = 'fill',
      loaderSize = 48,
      style,
      contentContainerStyle,
      onScroll,
      children,
      ...restProps
    },
    ref
  ) {
    const [refreshing, setRefreshing] = useState(false);
    const handleRefresh = useCallback(async () => {
      if (!onRefresh) return;
      setRefreshing(true);
      try {
        await onRefresh();
      } catch {
        // The query's own error state reports the failure; the spinner must not outlive it.
      } finally {
        setRefreshing(false);
      }
    }, [onRefresh]);

    const scrollY = useRef(new Animated.Value(0)).current;
    const refreshAnim = useRef(new Animated.Value(refreshing ? 1 : 0)).current;

    useEffect(() => {
      Animated.timing(refreshAnim, {
        toValue: refreshing ? 1 : 0,
        duration: refreshing ? 150 : 200,
        useNativeDriver: true,
      }).start();
    }, [refreshing]);

    const handleScroll = Animated.event(
      [{ nativeEvent: { contentOffset: { y: scrollY } } }],
      {
        useNativeDriver: true,
        listener: onScroll,
      }
    );

    // Pull distance opacity: as user drags down on iOS, scrollY goes negative.
    const pullOpacity = scrollY.interpolate({
      inputRange: [-60, -15, 0],
      outputRange: [1, 0, 0],
      extrapolate: 'clamp',
    });

    // Indicator is visible while pulling down or actively refreshing.
    const indicatorOpacity = Animated.add(pullOpacity, refreshAnim).interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });

    // Subtle downward slide during pull gesture
    const pullTranslateY = scrollY.interpolate({
      inputRange: [-80, -20, 0],
      outputRange: [14, 0, 0],
      extrapolate: 'clamp',
    });

    const refreshTranslateY = refreshAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 8],
      extrapolate: 'clamp',
    });

    const indicatorTranslateY = Animated.add(pullTranslateY, refreshTranslateY).interpolate({
      inputRange: [0, 24],
      outputRange: [0, 14],
      extrapolate: 'clamp',
    });

    const refreshControl = onRefresh ? (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={handleRefresh}
        tintColor="transparent"
        colors={['transparent']}
        progressBackgroundColor="transparent"
        style={styles.transparentRefreshControl}
      />
    ) : undefined;

    return (
      <View style={[styles.container, style]}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicatorContainer,
            {
              opacity: indicatorOpacity,
              transform: [{ translateY: indicatorTranslateY }],
            },
          ]}
        >
          <RevimeLottie variant={loaderVariant} size={loaderSize} loop={true} />
        </Animated.View>

        <Animated.ScrollView
          ref={ref as any}
          {...restProps}
          style={styles.scrollView}
          contentContainerStyle={contentContainerStyle}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={refreshControl}
        >
          {children}
        </Animated.ScrollView>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  indicatorContainer: {
    position: 'absolute',
    top: 6,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  scrollView: {
    flex: 1,
  },
  transparentRefreshControl: {
    backgroundColor: 'transparent',
  },
});
