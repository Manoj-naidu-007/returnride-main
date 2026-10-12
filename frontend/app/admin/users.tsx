import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";

import { api } from "@/src/api";
import { AdminShell } from "@/src/components/admin-shell";
import { AdminUserModal } from "@/src/components/admin-user-modal";
import { Icon } from "@/src/components/icon";
import { Badge, Card, Chip, EmptyState, PressableScale } from "@/src/components/ui";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const ROLES = ["all", "passenger", "driver", "admin"];
const STATUSES = ["all", "active", "blocked"];

export default function AdminUsers() {
  const s = useStyles();
  const { colors } = useTheme();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<any>(null);
  const timer = useRef<any>(null);
  const [debounced, setDebounced] = useState("");

  const onSearch = (t: string) => {
    setQ(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(t), 400);
  };

  const params = new URLSearchParams();
  if (debounced) params.set("q", debounced);
  if (role !== "all") params.set("role", role);
  if (status !== "all") params.set("status", status);

  const usersQ = useQuery({
    queryKey: ["admin", "users", debounced, role, status],
    queryFn: () => api.get(`/admin/users?${params.toString()}`),
    refetchInterval: 8000,
  });
  const users = usersQ.data?.users ?? [];

  return (
    <AdminShell active="users" title="Users">
      <View style={s.filters}>
        <View style={s.searchWrap}>
          <Icon name="magnify" size={20} color={colors.muted} />
          <TextInput testID="user-search" placeholder="Search name or phone" placeholderTextColor={colors.muted} style={s.search} value={q} onChangeText={onSearch} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          {ROLES.map((r) => <Chip key={r} testID={`role-filter-${r}`} label={r} active={role === r} onPress={() => setRole(r)} />)}
          <View style={s.sep} />
          {STATUSES.map((st) => <Chip key={st} testID={`status-filter-${st}`} label={st} active={status === st} onPress={() => setStatus(st)} />)}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
        <Text style={s.count}>{usersQ.data?.total ?? 0} users</Text>
        {users.length === 0 ? (
          <EmptyState icon="account-off" title="No users found" />
        ) : (
          users.map((u: any) => (
            <PressableScale key={u.id} testID={`user-${u.id}`} onPress={() => setSelected(u)}>
              <Card style={s.row}>
                <View style={s.avatar}><Icon name="account" size={22} color="#FFFFFF" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{u.name}</Text>
                  <Text style={s.muted}>+91 {u.phone} · ⭐ {Number(u.rating ?? 5).toFixed(1)}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Badge label={u.role} tone="brand" />
                  <Badge label={u.status ?? "active"} tone={u.status === "blocked" ? "error" : "success"} />
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
  filters: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.md, borderBottomWidth: 1, borderBottomColor: c.border },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: spacing.lg, height: 46 },
  search: { flex: 1, fontSize: 15, color: c.onSurface },
  chipRow: { gap: spacing.sm, alignItems: "center" },
  sep: { width: 1, height: 24, backgroundColor: c.border, marginHorizontal: 4 },
  list: { padding: spacing.xl, gap: spacing.md, maxWidth: 900, width: "100%", alignSelf: "center" },
  count: { color: c.muted, fontSize: 13, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  name: { color: c.onSurface, fontSize: 16, fontWeight: "800" },
  muted: { color: c.muted, fontSize: 13 },
}));
