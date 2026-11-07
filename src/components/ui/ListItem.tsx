import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Colors, Typography, BorderRadius, Spacing, Shadows } from '../../constants/theme';
import { useThemeStore } from '../../stores/themeStore';

interface ListItemProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  left?: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  showArrow?: boolean;
}

export const ListItem: React.FC<ListItemProps> = ({
  title,
  subtitle,
  right,
  left,
  onPress,
  style,
  showArrow = true,
}) => {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;

  const content = (
    <View style={[styles.container, { backgroundColor: theme.card, borderColor: theme.border }, style]}>
      {left && <View style={styles.left}>{left}</View>}
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>{title}</Text>
        {subtitle && (
          <Text style={[styles.subtitle, { color: theme.textSecondary }]} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
      {right ? (
        <View style={styles.right}>{right}</View>
      ) : showArrow && onPress ? (
        <Text style={[styles.arrow, { color: theme.textMuted }]}>›</Text>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
};

// Section header
export const SectionHeader: React.FC<{ title: string; action?: React.ReactNode }> = ({
  title,
  action,
}) => {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;

  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{title.toUpperCase()}</Text>
      {action}
    </View>
  );
};

// Divider
export const Divider: React.FC<{ style?: ViewStyle }> = ({ style }) => {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  return <View style={[{ height: 1, backgroundColor: theme.border, marginVertical: Spacing.sm }, style]} />;
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  left: {
    marginRight: Spacing.md,
  },
  content: {
    flex: 1,
  },
  title: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.size.base,
  },
  subtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm,
    marginTop: 2,
  },
  right: {
    marginLeft: Spacing.md,
    alignItems: 'flex-end',
  },
  arrow: {
    fontSize: 22,
    marginLeft: Spacing.sm,
    fontWeight: '300',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  sectionTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.size.xs,
    letterSpacing: 1,
  },
});

