import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { api } from "@/src/api";
import { AdminShell } from "@/src/components/admin-shell";
import { AdminUserModal } from "@/src/components/admin-user-modal";
import { Icon } from "@/src/components/icon";
import { Badge, Card, Chip, EmptyState, PressableScale } from "@/src/components/ui";
import { makeStyles, spacing, useTheme } from "@/src/theme";

export default function AdminDrivers() {
  const s = useStyles();
  const { colors } = useTheme();
  const [verified, setVerified] = useState("all");
  const [selected, setSelected] = useState<any>(null);

  const driversQ = useQuery({
    queryKey: ["admin", "drivers"],
    queryFn: () => api.get(`/admin/users?role=driver&limit=100`),
    refetchInterval: 8000,
  });
  let drivers = driversQ.data?.users ?? [];
  if (verified === "verified") drivers = drivers.filter((d: any) => d.verified);
  else if (verified === "unverified") drivers = drivers.filter((d: any) => !d.verified);

  return (
    <AdminShell active="drivers" title="Drivers">
      <View style={s.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          {["all", "verified", "unverified"].map((v) => (
            <Chip key={v} testID={`verified-filter-${v}`} label={v} active={verified === v} onPress={() => setVerified(v)} />
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
        <Text style={s.count}>{drivers.length} drivers</Text>
        {drivers.length === 0 ? (
          <EmptyState icon="steering" title="No drivers found" />
        ) : (
          drivers.map((d: any) => (
            <PressableScale key={d.id} testID={`driver-${d.id}`} onPress={() => setSelected(d)}>
              <Card style={{ gap: spacing.sm }}>
                <View style={s.row}>
                  <View style={s.avatar}><Icon name="steering" size={22} color="#FFFFFF" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.name}>{d.name}</Text>
                    <Text style={s.muted}>{d.vehicle_model ?? "—"} · {d.vehicle_number ?? "—"}</Text>
                  </View>
                  {d.verified ? <Badge label="Verified" tone="success" /> : <Badge label="Unverified" tone="warning" />}
                </View>
                <View style={s.statRow}>
                  <Text style={s.stat}>⭐ {Number(d.rating ?? 5).toFixed(1)}</Text>
                  <Text style={s.stat}>✅ {d.completed_rides ?? 0} done</Text>
                  <Text style={s.stat}>✖ {d.cancelled_rides ?? 0} cancelled</Text>
                  {d.status === "blocked" ? <Badge label="Blocked" tone="error" /> : null}
                </View>
              </Card>
            </PressableScale>
          ))
        )}
        <View style={{ height: spacing["2xl"] }} />
      </ScrollView>

      {selected ? <AdminUserModal user={selected} onClose={() => setSelected(null)} /> : null}
    </AdminShell>
  );
}

const useStyles = makeStyles((c) => ({
  filters: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.border },
  chipRow: { gap: spacing.sm },
  list: { padding: spacing.xl, gap: spacing.md, maxWidth: 900, width: "100%", alignSelf: "center" },
  count: { color: c.muted, fontSize: 13, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  name: { color: c.onSurface, fontSize: 16, fontWeight: "800" },
  muted: { color: c.muted, fontSize: 13 },
  statRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexWrap: "wrap" },
  stat: { color: c.onSurfaceSecondary, fontSize: 13, fontWeight: "700" },
}));
