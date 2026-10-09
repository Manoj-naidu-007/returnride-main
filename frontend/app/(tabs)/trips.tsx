import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Badge, Card, Chip, EmptyState, PressableScale } from "@/src/components/ui";
import { ACTIVE_STATES, STATUS_META } from "@/src/status";
import { makeStyles, spacing, useTheme } from "@/src/theme";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

export default function Trips() {
  const s = useStyles();
  const { colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState("all");

  const q = useQuery({ queryKey: ["bookings", "mine"], queryFn: () => api.get("/bookings/mine"), refetchInterval: 8000 });
  let bookings = q.data?.bookings ?? [];
  if (filter === "active") bookings = bookings.filter((b: any) => ACTIVE_STATES.includes(b.status));
  else if (filter === "completed") bookings = bookings.filter((b: any) => b.status === "completed");
  else if (filter === "cancelled") bookings = bookings.filter((b: any) => ["cancelled", "rejected"].includes(b.status));

  const isDriver = user?.role === "driver";

  return (
    <View style={s.container}>
      <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={s.title}>Your trips</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          {FILTERS.map((f) => (
            <Chip key={f.key} testID={`filter-${f.key}`} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => qc.invalidateQueries({ queryKey: ["bookings", "mine"] })} tintColor={colors.brandPrimary} />}
      >
        {bookings.length === 0 ? (
          <EmptyState icon="road-variant" title="No trips here" subtitle="Trips matching this filter will appear here." />
        ) : (
          bookings.map((b: any) => (
            <PressableScale key={b.id} testID={`trip-${b.id}`} onPress={() => router.push(ACTIVE_STATES.includes(b.status) ? `/ride/${b.id}` : `/trip-summary/${b.id}`)}>
              <Card style={{ gap: spacing.sm }}>
                <View style={s.rowBetween}>
                  <Text style={s.route} numberOfLines={1}>{b.pickup?.address?.split(",")[0]} → {b.drop?.address?.split(",")[0]}</Text>
                  <Badge label={STATUS_META[b.status]?.label ?? b.status} tone={STATUS_META[b.status]?.tone ?? "muted"} />
                </View>
                <View style={s.rowBetween}>
                  <Text style={s.muted}>{isDriver ? b.passenger_name : b.driver_name} · {b.distance_km} km</Text>
                  <Text style={s.fare}>₹{b.final_fare ?? b.estimated_fare}</Text>
                </View>
                {b.status === "completed" && b.payment_status !== "paid" ? (
                  <Badge label="Payment pending" tone="warning" />
                ) : null}
              </Card>
            </PressableScale>
          ))
        )}
        <View style={{ height: spacing["2xl"] }} />
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, gap: spacing.md, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  title: { color: c.onSurface, fontSize: 24, fontWeight: "900" },
  chipRow: { gap: spacing.sm, paddingRight: spacing.xl },
  scroll: { padding: spacing.xl, gap: spacing.md },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  route: { color: c.onSurface, fontSize: 16, fontWeight: "800", flex: 1 },
  muted: { color: c.muted, fontSize: 14, flex: 1 },
  fare: { color: c.brandPrimary, fontSize: 17, fontWeight: "900" },
}));
