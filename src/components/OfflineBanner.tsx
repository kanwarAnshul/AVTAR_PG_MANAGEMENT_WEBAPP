import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { Spacing } from '../constants/theme';
import { useIsOnline } from '../hooks/useOffline';

const { width } = Dimensions.get('window');

/**
 * Global animated offline banner. Slides down from the top and pulses
 * while the device is offline; disappears once connectivity returns.
 */
export const OfflineBanner: React.FC = () => {
  const isOnline = useIsOnline();
  const [slide] = useState(() => new Animated.Value(-80));
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!isOnline) {
      Animated.timing(slide, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }).start();
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      Animated.timing(slide, {
        toValue: -80,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isOnline, pulse, slide]);

  if (isOnline) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.banner, { transform: [{ translateY: slide }] }]}
    >
      <Animated.View style={[styles.pill, { transform: [{ scale: pulse }] }]}>
        <Text style={styles.dot}>●</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>You are offline</Text>
          <Text style={styles.subtitle}>
            Changes will sync automatically when you reconnect.
          </Text>
        </View>
        <Text style={styles.icon}>📡</Text>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingTop: 8,
    paddingHorizontal: Spacing.md,
    elevation: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: '#7F1D1D',
    borderRadius: 14,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: '#EF4444',
    width: Math.min(width - Spacing.md * 2, 520),
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  dot: { color: '#FCA5A5', fontSize: 12 },
  title: { color: '#FEF2F2', fontWeight: '700', fontSize: 13 },
  subtitle: { color: '#FECACA', fontSize: 11, marginTop: 1 },
  icon: { fontSize: 20 },
});

export default OfflineBanner;
