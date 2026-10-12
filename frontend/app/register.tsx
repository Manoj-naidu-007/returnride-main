import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth-context";
import { Icon } from "@/src/components/icon";
import { useToast } from "@/src/components/toast";
import { Button, TextField } from "@/src/components/ui";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function Register() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { register } = useAuth();
  const toast = useToast();

  const [role, setRole] = useState<"passenger" | "driver">("passenger");
  const [gender, setGender] = useState<"male" | "female">("male");
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async () => {
    if (!form.name || !form.phone || !form.password) {
      toast.show("Name, phone and password are required", "error");
      return;
    }
    if (form.password.length < 4) {
      toast.show("Password must be at least 4 characters", "error");
      return;
    }
    if (role === "driver" && (!form.vehicle_model || !form.vehicle_number)) {
      toast.show("Vehicle model and number are required for drivers", "error");
      return;
    }
    setLoading(true);
    try {
      const u = await register({ ...form, role, gender });
      toast.show(`Welcome, ${u.name.split(" ")[0]}!`, "success");
      router.replace("/(tabs)");
    } catch (e: any) {
      toast.show(e?.message ?? "Registration failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.container}>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={[s.scroll, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl }]}>
        <Pressable testID="back-button" onPress={() => router.back()} style={s.back} hitSlop={10}>
          <Icon name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>

        <Text style={s.title}>Create your account</Text>
        <Text style={s.subtitle}>Join your village ride network</Text>

        <Text style={s.groupLabel}>I want to</Text>
        <View style={s.segment}>
          {(["passenger", "driver"] as const).map((r) => (
            <Pressable key={r} testID={`role-${r}`} onPress={() => setRole(r)} style={[s.segItem, role === r && s.segItemActive]}>
              <Icon name={r === "passenger" ? "seat-passenger" : "steering"} size={20} color={role === r ? colors.onBrandPrimary : colors.onSurfaceTertiary} />
              <Text style={[s.segText, role === r && s.segTextActive]}>{r === "passenger" ? "Book rides" : "Offer rides"}</Text>
            </Pressable>
          ))}
        </View>

        <View style={s.fields}>
          <TextField testID="reg-name-input" label="Full name" icon="account" placeholder="Your name" value={form.name} onChangeText={set("name")} />
          <TextField testID="reg-phone-input" label="Phone number" icon="phone" keyboardType="phone-pad" placeholder="9xxxxxxxxx" value={form.phone} onChangeText={set("phone")} />
          <TextField testID="reg-password-input" label="Password" icon="lock" secureTextEntry placeholder="Min 4 characters" value={form.password} onChangeText={set("password")} />

          <Text style={s.groupLabel}>Gender</Text>
          <View style={s.segment}>
            {(["male", "female"] as const).map((g) => (
              <Pressable key={g} testID={`gender-${g}`} onPress={() => setGender(g)} style={[s.segItem, gender === g && s.segItemActive]}>
                <Text style={[s.segText, gender === g && s.segTextActive]}>{g === "male" ? "Male" : "Female"}</Text>
              </Pressable>
            ))}
          </View>

          {role === "driver" ? (
            <>
              <TextField testID="reg-vehicle-model" label="Vehicle model" icon="car" placeholder="e.g. Mahindra Bolero" value={form.vehicle_model} onChangeText={set("vehicle_model")} />
              <TextField testID="reg-vehicle-number" label="Vehicle number" icon="card-text" placeholder="MH11 AB 1234" value={form.vehicle_number} onChangeText={set("vehicle_number")} autoCapitalize="characters" />
              <TextField testID="reg-license" label="Licence number (optional)" icon="card-account-details" placeholder="Driving licence no." value={form.license_no} onChangeText={set("license_no")} />
            </>
          ) : null}
        </View>

        <Button testID="register-submit-button" title="Create account" onPress={onSubmit} loading={loading} icon="account-plus" />
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  scroll: { flexGrow: 1, padding: spacing.xl, gap: spacing.md },
  back: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  title: { color: c.onSurface, fontSize: 26, fontWeight: "900", marginTop: spacing.sm },
  subtitle: { color: c.muted, fontSize: 15 },
  groupLabel: { color: c.onSurface, fontSize: 14, fontWeight: "800", marginTop: spacing.sm },
  segment: { flexDirection: "row", gap: spacing.sm, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.xs },
  segItem: { flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: radius.sm },
  segItemActive: { backgroundColor: c.brandPrimary },
  segText: { color: c.onSurfaceTertiary, fontSize: 14, fontWeight: "700" },
  segTextActive: { color: c.onBrandPrimary },
  fields: { gap: spacing.md },
}));
