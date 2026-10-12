import { createContext, useCallback, useContext, useRef, useState, type PropsWithChildren } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/src/components/icon";
import { makeStyles, radius, shadow, spacing, useTheme } from "@/src/theme";

type Tone = "success" | "error" | "info";
type Toast = { id: number; message: string; tone: Tone };

const ToastContext = createContext<{ show: (message: string, tone?: Tone) => void } | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { colors } = useTheme();

  const show = useCallback((message: string, tone: Tone = "info") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const iconFor = (tone: Tone) => (tone === "success" ? "check-circle" : tone === "error" ? "alert-circle" : "information");
  const colorFor = (tone: Tone) => (tone === "success" ? colors.success : tone === "error" ? colors.error : colors.info);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <View pointerEvents="box-none" style={[s.host, { top: insets.top + spacing.sm }]}>
        {toasts.map((t) => (
          <Animated.View key={t.id} entering={FadeInUp} exiting={FadeOutUp} style={s.toast} testID="toast">
            <Icon name={iconFor(t.tone)} size={22} color={colorFor(t.tone)} />
            <Text style={s.text}>{t.message}</Text>
          </Animated.View>
        ))}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const useStyles = makeStyles((c) => ({
  host: { position: "absolute", left: spacing.lg, right: spacing.lg, alignItems: "center", gap: spacing.sm, zIndex: 9999 },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: c.border,
    maxWidth: 520,
    width: "100%",
    ...shadow.lg,
  },
  text: { flex: 1, color: c.onSurface, fontSize: 14, fontWeight: "600" },
}));
