// The root component is app/_layout.tsx (Expo Router file-based routing).
// App.tsx is kept as a thin re-export for backwards compatibility with any
// tooling that imports it; the app entry is `expo-router/entry` (see
// package.json "main"), which mounts app/_layout.tsx directly.
import RootLayout from './app/_layout';

export default RootLayout;
