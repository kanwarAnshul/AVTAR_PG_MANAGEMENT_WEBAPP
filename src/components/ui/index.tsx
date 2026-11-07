import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ViewStyle,
} from 'react-native';
import { Colors, Typography, BorderRadius, Spacing, Shadows } from '../../constants/theme';
import { useThemeStore } from '../../stores/themeStore';
import { Button } from './Button';

// ——— Screen Header ———
interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  left?: React.ReactNode;
  style?: ViewStyle;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title, subtitle, right, left, style,
}) => {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;

  return (
    <View style={[styles.header, { backgroundColor: theme.background, borderBottomColor: theme.border }, style]}>
      {left && <View style={styles.headerLeft}>{left}</View>}
      <View style={styles.headerCenter}>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>{title}</Text>
        {subtitle && (
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {right && <View style={styles.headerRight}>{right}</View>}
    </View>
  );
};

// ——— Empty State ———
interface EmptyStateProps {
  icon: string;
  title: string;
  description?: string;
  action?: { label: string; onPress: () => void };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon, title, description, action,
}) => {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;

  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>{title}</Text>
      {description && (
        <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>{description}</Text>
      )}
      {action && (
        <Button
          title={action.label}
          onPress={action.onPress}
          size="md"
          fullWidth={false}
          style={{ marginTop: Spacing.base }}
        />
      )}
    </View>
  );
};

// ——— Loading Spinner ———
export const LoadingView: React.FC<{ message?: string }> = ({ message }) => {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;

  return (
    <View style={[styles.loading, { backgroundColor: theme.background }]}>
      <Text style={styles.loadingIcon}>⏳</Text>
      <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
        {message ?? 'Loading...'}
      </Text>
    </View>
  );
};

// ——— Confirm Dialog ———
interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'primary';
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  visible, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  onConfirm, onCancel, variant = 'primary', isLoading,
}) => {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
          <TouchableWithoutFeedback>
            <View style={[styles.dialog, { backgroundColor: theme.card }, Shadows.lg]}>
              <Text style={[styles.dialogTitle, { color: theme.text }]}>{title}</Text>
              <Text style={[styles.dialogMessage, { color: theme.textSecondary }]}>{message}</Text>
              <View style={styles.dialogActions}>
                <Button
                  title={cancelLabel}
                  variant="secondary"
                  onPress={onCancel}
                  style={{ flex: 1, marginRight: Spacing.sm }}
                />
                <Button
                  title={confirmLabel}
                  variant={variant}
                  onPress={onConfirm}
                  isLoading={isLoading}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

// ——— Notification Bell ———
interface NotificationBellProps {
  count: number;
  onPress: () => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ count, onPress }) => {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;

  return (
    <TouchableOpacity onPress={onPress} style={styles.bell}>
      <Text style={{ fontSize: 22 }}>🔔</Text>
      {count > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  headerLeft: { marginRight: Spacing.sm },
  headerCenter: { flex: 1 },
  headerRight: { marginLeft: Spacing.sm },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.lg,
  },
  headerSubtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm,
    marginTop: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['3xl'],
  },
  emptyIcon: { fontSize: 56, marginBottom: Spacing.base },
  emptyTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.size.lg,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  emptyDesc: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.base,
    textAlign: 'center',
    lineHeight: 22,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingIcon: { fontSize: 48, marginBottom: Spacing.md },
  loadingText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.base,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  dialog: {
    width: '100%',
    borderRadius: BorderRadius['2xl'],
    padding: Spacing.xl,
  },
  dialogTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.lg,
    marginBottom: Spacing.sm,
  },
  dialogMessage: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.base,
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  dialogActions: {
    flexDirection: 'row',
  },
  bell: {
    padding: Spacing.sm,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: Colors.error,
    borderRadius: BorderRadius.full,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFF',
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
  },
});

