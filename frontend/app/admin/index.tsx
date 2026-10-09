import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import { api } from "@/src/api";
import { AdminShell } from "@/src/components/admin-shell";
import { Icon } from "@/src/components/icon";
import { Badge, Card, PressableScale } from "@/src/components/ui";
import { makeStyles, radius, shadow, spacing, useTheme } from "@/src/theme";

const KPIS: { key: string; label: string; icon: string }[] = [
  { key: "total", label: "Total rides", icon: "counter" },
  { key: "completed", label: "Completed", icon: "flag-checkered" },
  { key: "ongoing", label: "Ongoing", icon: "steering" },
  { key: "pending", label: "Pending", icon: "clock-outline" },
  { key: "cancelled", label: "Cancelled", icon: "close-circle" },
  { key: "revenue", label: "Revenue ₹", icon: "cash" },
];

const STATUS_COLORS: Record<string, string> = {
  completed: "#4A7C59", in_progress: "#C56A3C", requested: "#D4A017",
  accepted: "#9CAF88", en_route: "#C56A3C", arrived: "#9CAF88",
  cancelled: "#B33939", rejected: "#B33939",
};

export default function AdminOverview() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();

  const statsQ = useQuery({ queryKey: ["admin", "stats"], queryFn: () => api.get("/admin/stats"), refetchInterval: 5000 });
  const liveQ = useQuery({ queryKey: ["admin", "live"], queryFn: () => api.get("/admin/live"), refetchInterval: 5000 });

  const kpis = statsQ.data?.kpis ?? {};
  const perDay = statsQ.data?.bookings_per_day ?? [];
  const statusSplit = statsQ.data?.status_split ?? {};
  const live = liveQ.data?.rides ?? [];

  const maxDay = Math.max(1, ...perDay.map((d: any) => d.count));
  const statusEntries = Object.entries(statusSplit).filter(([, v]) => (v as number) > 0);
  const statusTotal = statusEntries.reduce((a, [, v]) => a + (v as number), 0) || 1;

  return (
    <AdminShell active="overview" title="Overview">
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.grid}>
          {KPIS.map((k) => (
            <Card key={k.key} style={s.kpi} testID={`kpi-${k.key}`}>
              <Icon name={k.icon as any} size={24} color={colors.brandPrimary} />
              <Text style={s.kpiValue}>{kpis[k.key] ?? 0}</Text>
              <Text style={s.kpiLabel}>{k.label}</Text>
            </Card>
          ))}
        </View>

        <View style={s.metaRow}>
          <Card style={s.metaCard}><Text style={s.metaValue}>{kpis.total_users ?? 0}</Text><Text style={s.metaLabel}>Users</Text></Card>
          <Card style={s.metaCard}><Text style={s.metaValue}>{kpis.total_drivers ?? 0}</Text><Text style={s.metaLabel}>Drivers</Text></Card>
          <Card style={s.metaCard}><Text style={s.metaValue}>{kpis.active_drivers ?? 0}</Text><Text style={s.metaLabel}>Active now</Text></Card>
        </View>

        <Card style={{ gap: spacing.md }}>
          <Text style={s.cardTitle}>Bookings — last 14 days</Text>
          {perDay.length === 0 ? <Text style={s.muted}>No data yet.</Text> : (
            <View style={s.chart}>
              {perDay.map((d: any) => (
                <View key={d.date} style={s.barCol}>
                  <View style={[s.bar, { height: 12 + (d.count / maxDay) * 120 }]} />
                  <Text style={s.barLabel}>{d.date.slice(5)}</Text>
                </View>
              ))}
            </View>
          )}
        </Card>

        <Card style={{ gap: spacing.md }}>
          <Text style={s.cardTitle}>Status split</Text>
          <View style={s.stackBar}>
            {statusEntries.map(([k, v]) => (
              <View key={k} style={{ flex: (v as number) / statusTotal, backgroundColor: STATUS_COLORS[k] ?? colors.muted }} />
            ))}
          </View>
          <View style={s.legend}>
            {statusEntries.map(([k, v]) => (
              <View key={k} style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: STATUS_COLORS[k] ?? colors.muted }]} />
                <Text style={s.legendText}>{k} ({v as number})</Text>
              </View>
            ))}
          </View>
        </Card>

        <View style={s.sectionRow}>
          <Text style={s.cardTitle}>Live rides ({live.length})</Text>
          <PressableScale testID="see-all-bookings" onPress={() => router.replace("/admin/bookings")}><Text style={s.link}>All bookings →</Text></PressableScale>
        </View>
        {live.length === 0 ? (
          <Card><Text style={s.muted}>No ongoing rides right now.</Text></Card>
        ) : (
          live.map((r: any) => (
            <PressableScale key={r.id} testID={`live-${r.id}`} onPress={() => router.replace(`/admin/bookings?focus=${r.id}`)}>
              <Card style={{ gap: 4 }}>
                <View style={s.between}>
                  <Text style={s.rowTitle}>{r.driver_name} → {r.passenger_name}</Text>
                  <Badge label={r.status} tone="brand" />
                </View>
                <Text style={s.muted} numberOfLines={1}>{r.pickup?.address?.split(",")[0]} → {r.drop?.address?.split(",")[0]}</Text>
              </Card>
            </PressableScale>
          ))
        )}
        <View style={{ height: spacing["2xl"] }} />
      </ScrollView>
    </AdminShell>
  );
}

const useStyles = makeStyles((c) => ({
  scroll: { padding: spacing.xl, gap: spacing.lg, maxWidth: 1000, width: "100%", alignSelf: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  kpi: { flexGrow: 1, flexBasis: 150, alignItems: "flex-start", gap: 4 },
  kpiValue: { color: c.onSurface, fontSize: 28, fontWeight: "900" },
  kpiLabel: { color: c.muted, fontSize: 13, fontWeight: "600" },
  metaRow: { flexDirection: "row", gap: spacing.md },
  metaCard: { flex: 1, alignItems: "center", gap: 2 },
  metaValue: { color: c.onSurface, fontSize: 22, fontWeight: "900" },
  metaLabel: { color: c.muted, fontSize: 12 },
  cardTitle: { color: c.onSurface, fontSize: 17, fontWeight: "900" },
  muted: { color: c.muted, fontSize: 14 },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: 150 },
  barCol: { flex: 1, alignItems: "center", gap: 4 },
  bar: { width: "70%", backgroundColor: c.brandPrimary, borderRadius: 4 },
  barLabel: { color: c.muted, fontSize: 9 },
  stackBar: { flexDirection: "row", height: 28, borderRadius: radius.sm, overflow: "hidden" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { color: c.onSurfaceSecondary, fontSize: 13, fontWeight: "600", textTransform: "capitalize" },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  link: { color: c.brandPrimary, fontWeight: "800", fontSize: 14 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowTitle: { color: c.onSurface, fontSize: 15, fontWeight: "800", flex: 1 },
}));
