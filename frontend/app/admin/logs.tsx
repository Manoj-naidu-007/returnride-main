import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Modal, Platform, ScrollView, Switch, Text, TextInput, View } from "react-native";

import { api } from "@/src/api";
import { API_BASE, TOKEN_KEY } from "@/src/constants";
import { AdminShell } from "@/src/components/admin-shell";
import { Icon } from "@/src/components/icon";
import { useToast } from "@/src/components/toast";
import { Button, Card, Chip, EmptyState, PressableScale } from "@/src/components/ui";
import { storage } from "@/src/utils/storage";
import { makeStyles, radius, shadow, spacing, useTheme } from "@/src/theme";

const LEVELS = ["all", "info", "warn", "error"];

export default function AdminLogs() {
  const s = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const [level, setLevel] = useState("all");
  const [action, setAction] = useState("");
  const [debounced, setDebounced] = useState("");
  const [liveTail, setLiveTail] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const timer = useRef<any>(null);

  const onAction = (t: string) => {
    setAction(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(t), 400);
  };

  const params = new URLSearchParams({ limit: "100" });
  if (level !== "all") params.set("level", level);
  if (debounced) params.set("action", debounced);

  const logsQ = useQuery({
    queryKey: ["admin", "logs", level, debounced],
    queryFn: () => api.get(`/admin/logs?${params.toString()}`),
    refetchInterval: liveTail ? 5000 : false,
  });
  const logs = logsQ.data?.logs ?? [];

  const exportCsv = async () => {
    try {
      const token = await storage.secureGet(TOKEN_KEY, "");
      const res = await fetch(`${API_BASE}/admin/logs/export`, { headers: { Authorization: `Bearer ${token}` } });
      const blob = await res.blob();
      if (Platform.OS === "web" && typeof document !== "undefined") {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "audit_logs.csv"; a.click();
        URL.revokeObjectURL(url);
        toast.show("CSV downloaded", "success");
      } else {
        toast.show("CSV export is available on the web dashboard", "info");
      }
    } catch {
      toast.show("Export failed", "error");
    }
  };

  const dotColor = (lvl: string) => (lvl === "error" ? colors.error : lvl === "warn" ? colors.warning : colors.success);

  return (
    <AdminShell active="logs" title="Audit logs">
      <View style={s.filters}>
        <View style={s.searchWrap}>
          <Icon name="magnify" size={20} color={colors.muted} />
          <TextInput testID="log-search" placeholder="Filter by action" placeholderTextColor={colors.muted} style={s.search} value={action} onChangeText={onAction} />
        </View>
        <View style={s.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
            {LEVELS.map((l) => <Chip key={l} testID={`level-${l}`} label={l} active={level === l} onPress={() => setLevel(l)} />)}
          </ScrollView>
        </View>
        <View style={s.toolRow}>
          <View style={s.liveRow}>
            <Text style={s.liveLabel}>Live tail</Text>
            <Switch testID="live-tail" value={liveTail} onValueChange={setLiveTail} trackColor={{ true: colors.brandPrimary }} />
          </View>
          <PressableScale testID="export-csv" onPress={exportCsv} style={s.exportBtn}>
            <Icon name="download" size={18} color={colors.onBrandPrimary} />
            <Text style={s.exportText}>Export CSV</Text>
          </PressableScale>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
        <Text style={s.count}>{logsQ.data?.total ?? 0} entries</Text>
        {logs.length === 0 ? (
          <EmptyState icon="text-box-search" title="No logs match" />
        ) : (
          logs.map((l: any) => (
            <PressableScale key={l.id} testID={`log-${l.id}`} onPress={() => setSelected(l)}>
              <Card style={s.row}>
                <View style={[s.dot, { backgroundColor: dotColor(l.level) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.action}>{l.action}</Text>
                  <Text style={s.muted}>{l.actor_role ?? "system"} · {l.entity_type ?? "-"}</Text>
                </View>
                <Text style={s.time}>{new Date(l.created_at).toLocaleTimeString()}</Text>
              </Card>
            </PressableScale>
          ))
        )}
        <View style={{ height: spacing["2xl"] }} />
      </ScrollView>

      {selected ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setSelected(null)}>
          <View style={s.bg}>
            <View style={s.jsonCard}>
              <View style={s.jsonHeader}>
                <Text style={s.jsonTitle}>{selected.action}</Text>
                <PressableScale testID="json-close" onPress={() => setSelected(null)}><Icon name="close" size={22} color={colors.onSurface} /></PressableScale>
              </View>
              <ScrollView style={{ maxHeight: 400 }}>
                <Text selectable style={s.json}>{JSON.stringify(selected, null, 2)}</Text>
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </AdminShell>
  );
}

const useStyles = makeStyles((c) => ({
  filters: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.md, borderBottomWidth: 1, borderBottomColor: c.border },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: spacing.lg, height: 46 },
  search: { flex: 1, fontSize: 15, color: c.onSurface },
  filterRow: {},
  chipRow: { gap: spacing.sm },
  toolRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  liveRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  liveLabel: { color: c.onSurface, fontSize: 14, fontWeight: "700" },
  exportBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.brandPrimary, paddingHorizontal: spacing.lg, height: 42, borderRadius: radius.md },
  exportText: { color: c.onBrandPrimary, fontWeight: "800", fontSize: 14 },
  list: { padding: spacing.xl, gap: spacing.sm, maxWidth: 900, width: "100%", alignSelf: "center" },
  count: { color: c.muted, fontSize: 13, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  dot: { width: 10, height: 10, borderRadius: 5 },
  action: { color: c.onSurface, fontSize: 14, fontWeight: "800" },
  muted: { color: c.muted, fontSize: 12 },
  time: { color: c.muted, fontSize: 12 },
  bg: { flex: 1, backgroundColor: "rgba(44,30,22,0.6)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  jsonCard: { width: "100%", maxWidth: 480, backgroundColor: c.surface, borderRadius: radius.lg, padding: spacing.xl, ...shadow.lg },
  jsonHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  jsonTitle: { color: c.onSurface, fontSize: 18, fontWeight: "900" },
  json: { color: c.onSurfaceSecondary, fontSize: 12, fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) },
}));
