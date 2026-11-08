import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Typography, BorderRadius, Spacing } from '../constants/theme';
import { useThemeStore } from '../stores/themeStore';
import type { ThemePreference } from '../types';

/**
 * Global theme control: Follow device (system) / Light / Dark.
 * Each signed-in user controls their own preference independently.
 */
export const ThemePicker: React.FC<{ showHint?: boolean }> = ({ showHint = true }) => {
  const { isDark, preference, setPreference } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;

  const options: { value: ThemePreference; label: string; icon: string }[] = [
    { value: 'system', label: 'Auto', icon: '◐' },
    { value: 'light', label: 'Light', icon: '☀️' },
    { value: 'dark', label: 'Dark', icon: '🌙' },
  ];

  return (
    <View>
      <View style={styles.row}>
        {options.map((opt) => {
          const active = preference === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => setPreference(opt.value)}
              activeOpacity={0.8}
              style={[
                styles.chip,
                { borderColor: theme.border, backgroundColor: theme.card },
                active && { backgroundColor: Colors.primary, borderColor: Colors.primary },
              ]}
            >
              <Text style={{ fontSize: 14 }}>{opt.icon}</Text>
              <Text
                style={[
                  styles.chipText,
                  { color: active ? '#FFF' : theme.textSecondary },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {showHint ? (
        <Text style={[styles.hint, { color: theme.textMuted }]}>
          {preference === 'system'
            ? 'Following your device theme automatically'
            : `Forced ${preference} mode — saved for your account`}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.sm },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
  },
  chipText: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm },
  hint: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 6, textAlign: 'center' },
});

export default ThemePicker;
