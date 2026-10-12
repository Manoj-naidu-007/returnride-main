import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth-context";
import { Icon } from "@/src/components/icon";
import { Badge, Button, Card } from "@/src/components/ui";
import { makeStyles, radius, shadow, spacing, useTheme } from "@/src/theme";

export default function Profile() {
  const s = useStyles();
  const { colors } = useTheme();
  const { user, logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDriver = user?.role === "driver";

  const onLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={[s.scroll, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing["2xl"] }]} showsVerticalScrollIndicator={false}>
        <View style={s.avatarWrap}>
          <View style={s.avatar}>
            <Icon name="account" size={48} color="#FFFFFF" />
          </View>
          <Text style={s.name}>{user?.name}</Text>
          <Text style={s.phone}>+91 {user?.phone}</Text>
          <View style={s.badges}>
            <Badge label={user?.role ?? "user"} tone="brand" />
            {user?.verified ? <Badge label="Verified" tone="success" /> : null}
          </View>
        </View>

        <Card style={s.statCard}>
          <View style={s.stat}>
            <Icon name="star" size={22} color={colors.brandSecondary} />
            <Text style={s.statValue}>{user?.rating?.toFixed(1) ?? "5.0"}</Text>
            <Text style={s.statLabel}>Rating</Text>
          </View>
          <View style={s.divider} />
          <View style={s.stat}>
            <Icon name="wallet" size={22} color={colors.success} />
            <Text style={s.statValue}>₹{user?.wallet_balance ?? 0}</Text>
            <Text style={s.statLabel}>Wallet</Text>
          </View>
        </Card>

        {isDriver ? (
          <Card style={{ gap: spacing.md }}>
            <Text style={s.sectionTitle}>Vehicle & documents</Text>
            <Row icon="car" label="Vehicle" value={user?.vehicle_model ?? "—"} />
            <Row icon="card-text" label="Number" value={user?.vehicle_number ?? "—"} />
          </Card>
        ) : null}

        <Card style={{ gap: spacing.md }}>
          <Text style={s.sectionTitle}>About ReturnRide</Text>
          <Row icon="leaf" label="Mission" value="Cut empty return trips in rural India" />
          <Row icon="shield-check" label="Safety" value="Start-ride OTP on every trip" />
        </Card>

        <Button testID="logout-button" title="Log out" variant="danger" icon="logout" onPress={onLogout} />
      </ScrollView>
    </View>
  );
}

function Row({ icon, label, value }: { icon: any; label: string; value: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.row}>
      <Icon name={icon} size={20} color={colors.brandPrimary} />
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  scroll: { padding: spacing.xl, gap: spacing.lg },
  avatarWrap: { alignItems: "center", gap: spacing.sm },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", ...shadow.md },
  name: { color: c.onSurface, fontSize: 24, fontWeight: "900" },
  phone: { color: c.muted, fontSize: 15 },
  badges: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  statCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  stat: { alignItems: "center", gap: 4, flex: 1 },
  statValue: { color: c.onSurface, fontSize: 22, fontWeight: "900" },
  statLabel: { color: c.muted, fontSize: 13, fontWeight: "600" },
  divider: { width: 1, height: 48, backgroundColor: c.border },
  sectionTitle: { color: c.onSurface, fontSize: 17, fontWeight: "900" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rowLabel: { color: c.muted, fontSize: 14, fontWeight: "700", width: 70 },
  rowValue: { color: c.onSurface, fontSize: 14, fontWeight: "600", flex: 1, textAlign: "right" },
  radiusRef: { borderRadius: radius.md },
}));
