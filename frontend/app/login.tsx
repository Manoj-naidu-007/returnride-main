import { Image } from "expo-image";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth-context";
import { useToast } from "@/src/components/toast";
import { Button, TextField } from "@/src/components/ui";
import { makeStyles, radius, shadow, spacing, useTheme } from "@/src/theme";

const HERO =
  "https://images.unsplash.com/photo-1604491671692-bb9413a6003b?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80";

export default function Login() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login } = useAuth();
  const toast = useToast();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!phone || !password) {
      toast.show("Enter your phone and password", "error");
      return;
    }
    setLoading(true);
    try {
      const u = await login(phone, password);
      toast.show(`Welcome back, ${u.name.split(" ")[0]}!`, "success");
      router.replace(u.role === "admin" ? "/admin" : "/(tabs)");
    } catch (e: any) {
      toast.show(e?.message ?? "Login failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.container}>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={[s.hero, { paddingTop: insets.top + spacing.lg }]}>
          <Image source={{ uri: HERO }} style={s.heroImg} contentFit="cover" />
          <View style={s.heroOverlay} />
          <View style={s.heroContent}>
            <View style={s.logoRow}>
              <View style={s.logoBadge}>
                <Text style={s.logoEmoji}>🛺</Text>
              </View>
              <Text style={s.brand}>ReturnRide</Text>
            </View>
            <Text style={s.tagline}>Share the road home. Rural return trips, made simple.</Text>
          </View>
        </View>

        <View style={s.form}>
          <Text style={s.title}>Welcome back</Text>
          <Text style={s.subtitle}>Sign in with your mobile number</Text>

          <TextField
            testID="login-phone-input"
            label="Phone number"
            icon="phone"
            keyboardType="phone-pad"
            placeholder="9000000001"
            value={phone}
            onChangeText={setPhone}
          />
          <TextField
            testID="login-password-input"
            label="Password"
            icon="lock"
            secureTextEntry
            placeholder="Your password"
            value={password}
            onChangeText={setPassword}
          />

          <View style={{ height: spacing.sm }} />
          <Button testID="login-submit-button" title="Sign In" onPress={onSubmit} loading={loading} icon="login" />

          <View style={s.registerRow}>
            <Text style={s.muted}>New to ReturnRide? </Text>
            <Link href="/register" style={s.link} testID="go-to-register">
              Create account
            </Link>
          </View>

          <View style={s.demoBox}>
            <Text style={s.demoTitle}>Demo accounts (password: demo1234)</Text>
            <Text style={s.demoText}>Driver: 9000000001 · Passenger: 8000000001</Text>
            <Text style={s.demoText}>Admin: 9999999999 (password: admin1234)</Text>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  scroll: { flexGrow: 1 },
  hero: { height: 300, paddingHorizontal: spacing.xl, justifyContent: "flex-end", paddingBottom: spacing.xl },
  heroImg: { ...({ position: "absolute" } as any), top: 0, left: 0, right: 0, bottom: 0 },
  heroOverlay: { ...({ position: "absolute" } as any), top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(44,30,22,0.5)" },
  heroContent: { gap: spacing.md },
  logoRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  logoBadge: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", ...shadow.md },
  logoEmoji: { fontSize: 26 },
  brand: { color: "#FFFFFF", fontSize: 30, fontWeight: "900", letterSpacing: 0.5 },
  tagline: { color: "#F3EBE1", fontSize: 15, fontWeight: "600", lineHeight: 21, maxWidth: 320 },
  form: { padding: spacing.xl, gap: spacing.lg, marginTop: -spacing.xl, backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  title: { color: c.onSurface, fontSize: 26, fontWeight: "900" },
  subtitle: { color: c.muted, fontSize: 15, marginTop: -spacing.md, marginBottom: spacing.xs },
  registerRow: { flexDirection: "row", justifyContent: "center", marginTop: spacing.sm },
  muted: { color: c.muted, fontSize: 14 },
  link: { color: c.brandPrimary, fontSize: 14, fontWeight: "800" },
  demoBox: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, gap: 4, borderWidth: 1, borderColor: c.border },
  demoTitle: { color: c.onSurface, fontSize: 13, fontWeight: "800" },
  demoText: { color: c.muted, fontSize: 13 },
}));
