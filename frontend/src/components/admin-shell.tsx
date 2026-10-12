import { useRouter } from "expo-router";
import { type ReactNode } from "react";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth-context";
import { Icon } from "@/src/components/icon";
import { PressableScale } from "@/src/components/ui";
import { makeStyles, radius, shadow, spacing, useTheme } from "@/src/theme";

export const ADMIN_NAV = [
  { key: "overview", label: "Overview", icon: "view-dashboard", path: "/admin" },
  { key: "users", label: "Users", icon: "account-group", path: "/admin/users" },
  { key: "drivers", label: "Drivers", icon: "steering", path: "/admin/drivers" },
  { key: "bookings", label: "Bookings", icon: "car-multiple", path: "/admin/bookings" },
  { key: "logs", label: "Logs", icon: "text-box-search", path: "/admin/logs" },
  { key: "settings", label: "Settings", icon: "cog", path: "/admin/settings" },
] as const;

export function AdminShell({ active, title, children }: { active: string; title: string; children: ReactNode }) {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  const go = (path: string) => router.replace(path as any);
  const onLogout = async () => { await logout(); router.replace("/login"); };

  if (wide) {
    return (
      <View style={[s.container, { flexDirection: "row" }]}>
        <View style={[s.sidebar, { paddingTop: insets.top + spacing.xl }]}>
          <View style={s.brandRow}>
            <View style={s.brandBadge}><Text style={{ fontSize: 20 }}>🛺</Text></View>
            <Text style={s.brand}>ReturnRide</Text>
          </View>
          <View style={{ gap: 4, marginTop: spacing.lg }}>
            {ADMIN_NAV.map((n) => (
              <PressableScale key={n.key} testID={`nav-${n.key}`} onPress={() => go(n.path)} style={[s.navItem, active === n.key && s.navItemActive]}>
                <Icon name={n.icon as any} size={22} color={active === n.key ? colors.onBrandPrimary : colors.onSurfaceTertiary} />
                <Text style={[s.navText, active === n.key && { color: colors.onBrandPrimary }]}>{n.label}</Text>
              </PressableScale>
            ))}
          </View>
          <View style={{ flex: 1 }} />
          <PressableScale testID="admin-logout" onPress={onLogout} style={s.navItem}>
            <Icon name="logout" size={22} color={colors.error} />
            <Text style={[s.navText, { color: colors.error }]}>Log out</Text>
          </PressableScale>
        </View>
        <View style={{ flex: 1 }}>
          <View style={[s.topbar, { paddingTop: insets.top + spacing.lg }]}>
            <Text style={s.pageTitle}>{title}</Text>
          </View>
          <View style={{ flex: 1 }}>{children}</View>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={[s.topbar, { paddingTop: insets.top + spacing.md }]}>
        <Text style={s.pageTitle}>{title}</Text>
        <PressableScale testID="admin-logout" onPress={onLogout} style={s.logoutBtn}>
          <Icon name="logout" size={20} color={colors.error} />
        </PressableScale>
      </View>
      <View style={s.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabRow}>
          {ADMIN_NAV.map((n) => (
            <PressableScale key={n.key} testID={`nav-${n.key}`} onPress={() => go(n.path)} style={[s.tab, active === n.key && s.tabActive]}>
              <Icon name={n.icon as any} size={18} color={active === n.key ? colors.onBrandPrimary : colors.onSurfaceTertiary} />
              <Text style={[s.tabText, active === n.key && { color: colors.onBrandPrimary }]}>{n.label}</Text>
            </PressableScale>
          ))}
        </ScrollView>
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  sidebar: { width: 240, backgroundColor: c.surfaceSecondary, borderRightWidth: 1, borderRightColor: c.border, paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.sm },
  brandBadge: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  brand: { color: c.onSurface, fontSize: 20, fontWeight: "900" },
  navItem: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 12, paddingHorizontal: spacing.md, borderRadius: radius.md },
  navItemActive: { backgroundColor: c.brandPrimary },
  navText: { color: c.onSurfaceTertiary, fontSize: 15, fontWeight: "700" },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  pageTitle: { color: c.onSurface, fontSize: 22, fontWeight: "900" },
  logoutBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  tabBar: { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  tabRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  tab: { flexShrink: 0, height: 40, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary },
  tabActive: { backgroundColor: c.brandPrimary },
  tabText: { color: c.onSurfaceTertiary, fontSize: 14, fontWeight: "700" },
}));
