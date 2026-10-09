import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import { api } from "@/src/api";
import { AdminShell } from "@/src/components/admin-shell";
import { useToast } from "@/src/components/toast";
import { Button, Card, TextField } from "@/src/components/ui";
import { makeStyles, spacing, useTheme } from "@/src/theme";

const FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "base_fare", label: "Base fare (₹)", hint: "Flat fare added to every trip" },
  { key: "rate_per_km", label: "Rate per km (₹)", hint: "Charge per road kilometre" },
  { key: "return_discount", label: "Return discount (0-1)", hint: "e.g. 0.25 = 25% off return trips" },
  { key: "pool_discount", label: "Pool discount (0-1)", hint: "e.g. 0.12 = 12% off pooled rides" },
  { key: "corridor_km", label: "Match corridor (km)", hint: "Max distance from route to match a rider" },
  { key: "co2_per_km", label: "CO₂ saved per km (kg)", hint: "Used for the CO₂ saved figure" },
];

export default function AdminSettings() {
  const s = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const settingsQ = useQuery({ queryKey: ["admin", "settings"], queryFn: () => api.get("/admin/settings") });
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settingsQ.data) {
      const f: Record<string, string> = {};
      FIELDS.forEach((fl) => { f[fl.key] = String(settingsQ.data[fl.key] ?? ""); });
      setForm(f);
    }
  }, [settingsQ.data]);

  const saveM = useMutation({
    mutationFn: () => {
      const body: Record<string, number> = {};
      FIELDS.forEach((fl) => { const v = parseFloat(form[fl.key]); if (!isNaN(v)) body[fl.key] = v; });
      return api.put("/admin/settings", body);
    },
    onSuccess: () => { toast.show("Fare settings saved", "success"); qc.invalidateQueries({ queryKey: ["admin", "settings"] }); },
    onError: (e: any) => toast.show(e?.message ?? "Failed", "error"),
  });

  return (
    <AdminShell active="settings" title="Fare settings">
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {settingsQ.isLoading ? (
          <ActivityIndicator size="large" color={colors.brandPrimary} />
        ) : (
          <Card style={{ gap: spacing.lg }}>
            <Text style={s.intro}>These values drive fare calculation and ride matching across the whole app.</Text>
            {FIELDS.map((fl) => (
              <View key={fl.key} style={{ gap: 4 }}>
                <TextField
                  testID={`setting-${fl.key}`}
                  label={fl.label}
                  keyboardType="decimal-pad"
                  value={form[fl.key] ?? ""}
                  onChangeText={(t) => setForm((p) => ({ ...p, [fl.key]: t }))}
                  icon="tune"
                />
                <Text style={s.hint}>{fl.hint}</Text>
              </View>
            ))}
            <Button testID="save-settings" title="Save settings" icon="content-save" onPress={() => saveM.mutate()} loading={saveM.isPending} />
          </Card>
        )}
        <View style={{ height: spacing["2xl"] }} />
      </ScrollView>
    </AdminShell>
  );
}

const useStyles = makeStyles((c) => ({
  scroll: { padding: spacing.xl, gap: spacing.lg, maxWidth: 640, width: "100%", alignSelf: "center" },
  intro: { color: c.muted, fontSize: 14, lineHeight: 20 },
  hint: { color: c.muted, fontSize: 12 },
}));
