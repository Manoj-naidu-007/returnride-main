import * as Haptics from "expo-haptics";
import { forwardRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  type PressableProps,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewProps,
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { Icon } from "@/src/components/icon";
import { makeStyles, radius, shadow, spacing, useTheme } from "@/src/theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function haptic(kind: "light" | "medium" | "success" = "light") {
  if (Platform.OS === "web") return;
  try {
    if (kind === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (kind === "medium") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    /* noop */
  }
}

/** Tactile press-scale wrapper. */
export function PressableScale({ children, onPress, style, disabled, hapticKind = "light", ...rest }: PressableProps & { hapticKind?: "light" | "medium" | "success" }) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={() => (scale.value = withSpring(0.96, { damping: 15 }))}
      onPressOut={() => (scale.value = withSpring(1, { damping: 15 }))}
      onPress={(e) => {
        if (disabled) return;
        haptic(hapticKind);
        onPress?.(e);
      }}
      style={[aStyle, style as any]}
    >
      {children}
    </AnimatedPressable>
  );
}

type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ComponentProps<typeof Icon>["name"];
  testID?: string;
  full?: boolean;
};

export function Button({ title, onPress, variant = "primary", loading, disabled, icon, testID, full = true }: ButtonProps) {
  const s = useButtonStyles();
  const { colors } = useTheme();
  const isDisabled = disabled || loading;
  const bg = {
    primary: s.primary,
    secondary: s.secondary,
    outline: s.outline,
    ghost: s.ghost,
    danger: s.danger,
  }[variant];
  const fg = {
    primary: colors.onBrandPrimary,
    secondary: colors.onBrandSecondary,
    outline: colors.brandPrimary,
    ghost: colors.brandPrimary,
    danger: colors.onError,
  }[variant];
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      hapticKind="medium"
      style={[s.base, bg, full && { alignSelf: "stretch" }, isDisabled && s.disabled]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={s.row}>
          {icon ? <Icon name={icon} size={20} color={fg} /> : null}
          <Text style={[s.label, { color: fg }]}>{title}</Text>
        </View>
      )}
    </PressableScale>
  );
}

const useButtonStyles = makeStyles((c) => ({
  base: {
    borderRadius: radius.md,
    paddingVertical: 15,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.sm,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  label: { fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },
  primary: { backgroundColor: c.brandPrimary },
  secondary: { backgroundColor: c.brandSecondary },
  outline: { backgroundColor: c.surface, borderWidth: 2, borderColor: c.brandPrimary },
  ghost: { backgroundColor: "transparent", shadowOpacity: 0, elevation: 0 },
  danger: { backgroundColor: c.error },
  disabled: { opacity: 0.5 },
}));

export function Card({ children, style, ...rest }: ViewProps & { children: ReactNode }) {
  const s = useCardStyles();
  return (
    <View style={[s.card, style]} {...rest}>
      {children}
    </View>
  );
}
const useCardStyles = makeStyles((c) => ({
  card: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: c.border,
    ...shadow.md,
  },
}));

export function Chip({ label, active, onPress, icon, testID }: { label: string; active?: boolean; onPress?: () => void; icon?: React.ComponentProps<typeof Icon>["name"]; testID?: string }) {
  const s = useChipStyles();
  const { colors } = useTheme();
  return (
    <PressableScale testID={testID} onPress={onPress} hapticKind="light" style={[s.chip, active && s.chipActive]}>
      {icon ? <Icon name={icon} size={16} color={active ? colors.onBrandPrimary : colors.onSurfaceTertiary} /> : null}
      <Text style={[s.label, active && s.labelActive]}>{label}</Text>
    </PressableScale>
  );
}
const useChipStyles = makeStyles((c) => ({
  chip: {
    flexShrink: 0,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: c.surfaceTertiary,
    borderWidth: 1,
    borderColor: c.border,
  },
  chipActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  label: { color: c.onSurfaceTertiary, fontSize: 14, fontWeight: "700" },
  labelActive: { color: c.onBrandPrimary },
}));

type FieldProps = TextInputProps & { label?: string; icon?: React.ComponentProps<typeof Icon>["name"]; error?: string; testID?: string };
export const TextField = forwardRef<TextInput, FieldProps>(function TextField({ label, icon, error, style, testID, ...rest }, ref) {
  const s = useFieldStyles();
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={[s.wrap, error ? s.wrapError : null]}>
        {icon ? <Icon name={icon} size={20} color={colors.muted} /> : null}
        <TextInput
          ref={ref}
          testID={testID}
          placeholderTextColor={colors.muted}
          style={[s.input, style]}
          {...rest}
        />
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
});
const useFieldStyles = makeStyles((c) => ({
  label: { color: c.onSurface, fontSize: 14, fontWeight: "700" },
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: c.surfaceTertiary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1.5,
    borderColor: c.border,
  },
  wrapError: { borderColor: c.error },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: c.onSurface },
  error: { color: c.error, fontSize: 12, fontWeight: "600" },
}));

export function Badge({ label, tone = "brand" }: { label: string; tone?: "brand" | "success" | "warning" | "error" | "muted" }) {
  const s = useBadgeStyles();
  return (
    <View style={[s.badge, s[tone]]}>
      <Text style={[s.text, s[`${tone}Text` as const]]}>{label}</Text>
    </View>
  );
}
const useBadgeStyles = makeStyles((c) => ({
  badge: { alignSelf: "flex-start", paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
  text: { fontSize: 12, fontWeight: "800", textTransform: "capitalize" },
  brand: { backgroundColor: c.brandTertiary },
  brandText: { color: c.onBrandTertiary },
  success: { backgroundColor: "#E4EFE7" },
  successText: { color: c.success },
  warning: { backgroundColor: "#F7EAC9" },
  warningText: { color: "#8A6D0F" },
  error: { backgroundColor: "#F5DEDE" },
  errorText: { color: c.error },
  muted: { backgroundColor: c.surfaceTertiary },
  mutedText: { color: c.muted },
}));

export function Stars({ value = 0, size = 20, onChange }: { value?: number; size?: number; onChange?: (v: number) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <PressableScale key={i} testID={`star-${i}`} onPress={() => onChange?.(i)} disabled={!onChange}>
          <Icon name={i <= value ? "star" : "star-outline"} size={size} color={colors.brandSecondary} />
        </PressableScale>
      ))}
    </View>
  );
}

export function EmptyState({ icon = "map-search-outline", title, subtitle }: { icon?: React.ComponentProps<typeof Icon>["name"]; title: string; subtitle?: string }) {
  const s = useEmptyStyles();
  const { colors } = useTheme();
  return (
    <View style={s.wrap}>
      <View style={s.circle}>
        <Icon name={icon} size={40} color={colors.brandPrimary} />
      </View>
      <Text style={s.title}>{title}</Text>
      {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}
const useEmptyStyles = makeStyles((c) => ({
  wrap: { alignItems: "center", justifyContent: "center", padding: spacing["2xl"], gap: spacing.md },
  circle: { width: 84, height: 84, borderRadius: 42, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  title: { color: c.onSurface, fontSize: 18, fontWeight: "800", textAlign: "center" },
  subtitle: { color: c.muted, fontSize: 14, textAlign: "center", lineHeight: 20 },
}));

export { haptic };
