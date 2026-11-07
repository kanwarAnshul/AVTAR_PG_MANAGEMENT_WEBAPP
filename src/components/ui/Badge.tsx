import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, BorderRadius, Spacing } from '../../constants/theme';
import { getStatusColor, capitalize } from '../../utils/helpers';

interface BadgeProps {
  label: string;
  status?: string;
  color?: { bg: string; text: string };
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ label, status, color, size = 'md' }) => {
  const colorStyle = color ?? getStatusColor(status ?? label.toLowerCase());

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: colorStyle.bg,
          paddingHorizontal: size === 'sm' ? Spacing.sm : Spacing.md,
          paddingVertical: size === 'sm' ? 2 : Spacing.xs,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: colorStyle.text,
            fontSize: size === 'sm' ? Typography.size.xs : Typography.size.sm,
          },
        ]}
      >
        {capitalize(label)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: Typography.fontFamily.semiBold,
  },
});

