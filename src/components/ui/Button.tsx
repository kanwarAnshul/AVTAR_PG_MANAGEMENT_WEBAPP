import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  StyleProp,
  TouchableOpacityProps,
} from 'react-native';
import { Colors, Typography, BorderRadius, Spacing, Shadows } from '../../constants/theme';
import { useThemeStore } from '../../stores/themeStore';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  fullWidth = true,
  style,
  textStyle,
  disabled,
  ...props
}) => {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;

  const getVariantStyles = (): { bg: string; text: string; border?: string } => {
    switch (variant) {
      case 'primary':
        return { bg: Colors.primary, text: '#FFFFFF' };
      case 'secondary':
        return { bg: isDark ? Colors.dark.surfaceAlt : Colors.light.surfaceAlt, text: theme.text };
      case 'outline':
        return { bg: 'transparent', text: Colors.primary, border: Colors.primary };
      case 'ghost':
        return { bg: 'transparent', text: Colors.primary };
      case 'danger':
        return { bg: Colors.error, text: '#FFFFFF' };
      case 'success':
        return { bg: Colors.success, text: '#FFFFFF' };
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'sm': return { py: Spacing.sm, px: Spacing.md, fontSize: Typography.size.sm };
      case 'md': return { py: Spacing.md, px: Spacing.base, fontSize: Typography.size.base };
      case 'lg': return { py: Spacing.base, px: Spacing.xl, fontSize: Typography.size.md };
    }
  };

  const variantStyle = getVariantStyles();
  const sizeStyle = getSizeStyles();
  const isDisabled = disabled || isLoading;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={isDisabled}
      style={[
        styles.base,
        {
          backgroundColor: variantStyle.bg,
          borderColor: variantStyle.border ?? 'transparent',
          borderWidth: variant === 'outline' ? 1.5 : 0,
          paddingVertical: sizeStyle.py,
          paddingHorizontal: sizeStyle.px,
          opacity: isDisabled ? 0.55 : 1,
          width: fullWidth ? '100%' : undefined,
          alignSelf: fullWidth ? undefined : 'flex-start',
        },
        variant === 'primary' && Shadows.primary,
        style,
      ]}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator color={variantStyle.text} size="small" />
      ) : (
        <>
          {leftIcon}
          <Text
            style={[
              styles.text,
              {
                color: variantStyle.text,
                fontSize: sizeStyle.fontSize,
                marginLeft: leftIcon ? Spacing.sm : 0,
                marginRight: rightIcon ? Spacing.sm : 0,
              },
              textStyle,
            ]}
          >
            {title}
          </Text>
          {rightIcon}
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.lg,
    minHeight: 48,
  },
  text: {
    fontFamily: Typography.fontFamily.semiBold,
    textAlign: 'center',
  },
});

