import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Colors, Typography, BorderRadius, Spacing, Shadows } from '../../constants/theme';
import { useThemeStore } from '../../stores/themeStore';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'elevated' | 'outlined' | 'filled';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  variant = 'default',
  padding = 'md',
}) => {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;

  const getPadding = () => {
    switch (padding) {
      case 'none': return 0;
      case 'sm': return Spacing.md;
      case 'md': return Spacing.base;
      case 'lg': return Spacing.xl;
    }
  };

  const getVariantStyle = () => {
    switch (variant) {
      case 'elevated':
        return { ...Shadows.md, backgroundColor: theme.card };
      case 'outlined':
        return { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border };
      case 'filled':
        return { backgroundColor: theme.surfaceAlt };
      default:
        return { backgroundColor: theme.card, ...Shadows.sm };
    }
  };

  return (
    <View
      style={[
        styles.card,
        { padding: getPadding(), borderRadius: BorderRadius.xl },
        getVariantStyle(),
        style,
      ]}
    >
      {children}
    </View>
  );
};

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: string;
  color?: string;
  style?: ViewStyle;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, icon, color, style }) => {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;

  return (
    <View
      style={[
        styles.statCard,
        {
          backgroundColor: color ? `${color}20` : theme.surfaceAlt,
          borderColor: color ? `${color}40` : theme.border,
          borderRadius: BorderRadius.xl,
        },
        style,
      ]}
    >
      {icon && <Text style={styles.icon}>{icon}</Text>}
      <Text style={[styles.statValue, { color: color ?? theme.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.md,
  },
  statCard: {
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  icon: {
    fontSize: 24,
    marginBottom: Spacing.xs,
  },
  statValue: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xl,
  },
  statLabel: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.xs,
    marginTop: 2,
    textAlign: 'center',
  },
});

