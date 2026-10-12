// ReturnRide design tokens — earthy / rural warm palette (light theme).
// Colors mirror the "color" block of /app/design_guidelines.json.
import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#FDFBF7",
  onSurface: "#2C1E16",
  surfaceSecondary: "#F3EBE1",
  onSurfaceSecondary: "#2C1E16",
  surfaceTertiary: "#E6DACB",
  onSurfaceTertiary: "#2C1E16",
  surfaceInverse: "#2C1E16",
  onSurfaceInverse: "#FDFBF7",
  muted: "#8A7B73",

  brand: "#C56A3C",
  onBrand: "#FFFFFF",
  brandPrimary: "#C56A3C",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#D4A017",
  onBrandSecondary: "#2C1E16",
  brandTertiary: "#9CAF88",
  onBrandTertiary: "#203318",

  success: "#4A7C59",
  onSuccess: "#FFFFFF",
  warning: "#D4A017",
  onWarning: "#2C1E16",
  error: "#B33939",
  onError: "#FFFFFF",
  info: "#6E645F",
  onInfo: "#FFFFFF",

  border: "#E6DACB",
  borderStrong: "#C56A3C",
  divider: "#E6DACB",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 } as const;
export const radius = { sm: 8, md: 16, lg: 24, pill: 999 } as const;

export const shadow = {
  sm: { shadowColor: "#2C1E16", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  md: { shadowColor: "#2C1E16", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.16, shadowRadius: 12, elevation: 6 },
  lg: { shadowColor: "#2C1E16", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 12 },
} as const;

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}
setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
