// ============================================================
// DESIGN TOKENS & THEME CONSTANTS
// "Olive & Ember" theme for AVTAR PG Manager
//
// Deep olive + near-black dark theme, warm cream light theme,
// amber ("ember") accent.
//
// Contrast: every text/background pair below was checked against
// WCAG AA (4.5:1). Brand colours that are used AS TEXT are exposed
// twice:
//   Colors.primary / .accent / .success ...  -> backgrounds
//                                                (white text on them)
//   theme.primary  / .accent  / .success ... -> text on that theme
// So screens should use `Colors.x` for fills and `theme.x` for text.
// ============================================================

export const Colors = {
  // Brand (used as FILL: buttons, avatars, banners -> white text sits on these)
  primary: '#4F5E28',       // Deep olive      white on it 7.08:1
  primaryDark: '#3E4A1F',   // Pressed olive   white on it 9.53:1
  primaryLight: '#8FA34E',  // Light olive (decor / dark-theme fills)
  accent: '#E8A33D',        // Ember amber     8.69:1 on dark bg

  // Status (used as FILL -> white text sits on these)
  success: '#46732A',       // white on it 5.61:1
  warning: '#8F5A06',       // white on it 5.78:1
  error: '#B3322A',         // white on it 6.16:1
  info: '#2F6B8C',          // white on it 5.83:1

  // Chips (light tinted pills, dark text on them - same in both themes)
  studentBg: '#E8EDD4',
  studentText: '#3F4C1C',   // 7.73:1
  employeeBg: '#FBEEDA',
  employeeText: '#8A5A12',  // 5.16:1
  pendingBg: '#FBF0D6',
  pendingText: '#8A6111',   // 4.88:1
  approvedBg: '#E4F0DC',
  approvedText: '#3D6B2A',  // 5.34:1
  rejectedBg: '#FBE3E1',
  rejectedText: '#9B2C22',  // 6.19:1

  // Dark theme
  dark: {
    background: '#10130D',   // Near-black with an olive cast   17.18:1 with text
    surface: '#171B12',      // Raised surface                 16.03:1 with text
    surfaceAlt: '#1E2417',   // Sunken / secondary surface     14.59:1 with text
    border: '#4A5540',       // 2.22:1 (previous theme was 1.93:1)
    text: '#F4F6EE',         // Warm white
    textSecondary: '#A8B396', // 7.95:1 on surface
    textMuted: '#7C8770',    // 4.62:1 on surface
    card: '#171B12',
    input: '#10130D',
    tabBar: '#171B12',
    tabBarBorder: '#2A3122',
    statusBar: 'light',
    overlay: 'rgba(0,0,0,0.7)',

    // Theme-aware brand colours for TEXT on dark surfaces
    primary: '#A8BC6B',      // 8.38:1 on surface, 8.98:1 on bg
    accent: '#E8A33D',       // 8.10:1 on surface
    success: '#7FB85C',      // 7.42:1 on surface
    warning: '#E8A33D',      // 8.10:1 on surface
    error: '#E07066',        // 5.56:1 on surface
    info: '#6FB3D4',         // 7.55:1 on surface
  },

  // Light theme
  light: {
    background: '#F7F8F2',   // Warm cream                        16.48:1 with text
    surface: '#FFFFFF',
    surfaceAlt: '#EFF1E6',   // Olive-tinted sunken surface       15.42:1 with text
    border: '#DCE1CC',       // 1.34:1 (previous theme was 1.23:1)
    text: '#171A12',         // Near-black with an olive cast
    textSecondary: '#4A5140', // 7.74:1 on bg
    textMuted: '#5C6450',    // 5.79:1 on bg
    card: '#FFFFFF',
    input: '#F2F4EA',
    tabBar: '#FFFFFF',
    tabBarBorder: '#DCE1CC',
    statusBar: 'dark',
    overlay: 'rgba(0,0,0,0.5)',

    // Theme-aware brand colours for TEXT on light surfaces
    primary: '#4F5E28',      // 6.63:1 on bg, 7.08:1 on white
    accent: '#8F5A06',       // 5.41:1 on bg
    success: '#46732A',      // 5.25:1 on bg
    warning: '#9A5B00',      // 5.08:1 on bg
    error: '#B3322A',        // 5.77:1 on bg
    info: '#2F6B8C',         // 5.46:1 on bg
  },
};

import { Platform } from 'react-native';

export const Typography = {
  fontFamily: {
    regular: Platform.select({ ios: 'Inter_400Regular', android: 'sans-serif', default: 'System' }),
    medium: Platform.select({ ios: 'Inter_500Medium', android: 'sans-serif-medium', default: 'System' }),
    semiBold: Platform.select({ ios: 'Inter_600SemiBold', android: 'sans-serif-medium', default: 'System' }),
    bold: Platform.select({ ios: 'Inter_700Bold', android: 'sans-serif-medium', default: 'System' }),
    extraBold: Platform.select({ ios: 'Inter_800ExtraBold', android: 'sans-serif', default: 'System' }),
  },
  size: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 19,
    xl: 22,
    '2xl': 26,
    '3xl': 30,
    '4xl': 36,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.7,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
};

export const BorderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  '2xl': 24,
  full: 9999,
};

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  primary: {
    shadowColor: '#4F5E28',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
};

export const APP_NAME = 'AVTAR SINGH PG';
export const APP_VERSION = '1.0.0';

export const COMPLAINT_CATEGORIES = [
  { label: 'Water Issue', value: 'water', icon: '💧' },
  { label: 'Electricity', value: 'electricity', icon: '⚡' },
  { label: 'Cleaning', value: 'cleaning', icon: '🧹' },
  { label: 'Furniture', value: 'furniture', icon: '🪑' },
  { label: 'WiFi / Internet', value: 'wifi', icon: '📶' },
  { label: 'Plumbing', value: 'plumbing', icon: '🔧' },
  { label: 'Security', value: 'security', icon: '🔐' },
  { label: 'Others', value: 'others', icon: '📋' },
];

export const PAYMENT_MODES = [
  { label: 'Cash', value: 'cash', icon: '💵' },
  { label: 'UPI', value: 'upi', icon: '📲' },
  { label: 'Bank Transfer', value: 'bank_transfer', icon: '🏦' },
  { label: 'Cheque', value: 'cheque', icon: '📄' },
];

export const ADDRESS_PROOF_TYPES = [
  'Aadhaar Card',
  'Voter ID',
  'Electricity Bill',
  'Passport',
  'Driving License',
  'Rent Agreement',
];

export const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
export const IMAGE_COMPRESS_SIZE = 800;
export const IMAGE_COMPRESS_QUALITY = 0.7;
