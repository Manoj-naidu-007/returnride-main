import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Icon } from "@/src/components/icon";
import { RouteMap } from "@/src/components/RouteMap";
import { useToast } from "@/src/components/toast";
import { Badge, Button, Card, PressableScale, Stars, TextField } from "@/src/components/ui";
import { makeStyles, radius, shadow, spacing, useTheme } from "@/src/theme";

const PAY_MODES = [
  { key: "cash", label: "Cash", icon: "cash" },
  { key: "upi", label: "UPI", icon: "cellphone" },
  { key: "wallet", label: "Wallet", icon: "wallet" },
  { key: "razorpay", label: "Razorpay", icon: "credit-card" },
];

export default function TripSummary() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const isDriver = user?.role === "driver";

  const q = useQuery({ queryKey: ["booking", id], queryFn: () => api.get(`/bookings/${id}`) });
  const b = q.data;

  const [mode, setMode] = useState("cash");
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");

  const payM = useMutation({
    mutationFn: (m: string) => api.post(`/bookings/${id}/pay`, { mode: m }),
    onSuccess: () => { toast.show("Payment recorded", "success"); qc.invalidateQueries({ queryKey: ["booking", id] }); },
    onError: (e: any) => toast.show(e?.message ?? "Payment failed", "error"),
  });
  const rateM = useMutation({
    mutationFn: () => api.post(`/bookings/${id}/rate`, { stars, comment }),
    onSuccess: () => { toast.show("Thanks for rating!", "success"); qc.invalidateQueries({ queryKey: ["booking", id] }); },
    onError: (e: any) => toast.show(e?.message ?? "Failed", "error"),
  });

  if (q.isLoading || !b) {
    return <View style={s.loader}><ActivityIndicator size="large" color={colors.brandPrimary} /></View>;
  }

  const fb = b.fare_breakdown ?? {};
  const total = b.final_fare ?? b.estimated_fare;
  const paid = b.payment_status === "paid";

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={[s.scroll, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing["2xl"] }]} showsVerticalScrollIndicator={false}>
        <View style={s.headerRow}>
          <PressableScale testID="summary-back" onPress={() => router.replace("/(tabs)")} style={s.iconBtn}>
            <Icon name="arrow-left" size={24} color={colors.onSurface} />
          </PressableScale>
          <Text style={s.headerTitle}>{isDriver ? "Trip earnings" : "Trip summary"}</Text>
          <View style={{ width: 46 }} />
        </View>

        <View style={s.totalWrap}>
          <Icon name="check-decagram" size={40} color={colors.success} />
          <Text style={s.totalLabel}>{isDriver ? "You earned" : "Total fare"}</Text>
          <Text style={s.total} testID="trip-total">₹{total}</Text>
          <Badge label={paid ? `Paid · ${b.payment_mode ?? ""}` : "Payment pending"} tone={paid ? "success" : "warning"} />
        </View>

        <View style={s.mapMini}>
          <RouteMap origin={b.pickup} destination={b.drop} routeGeometry={b.route_geometry} fitToRoute interactive={false} />
        </View>

        <Card style={{ gap: spacing.sm }}>
          <Row label="Base fare" value={`₹${fb.base_fare ?? 0}`} />
          <Row label={`Distance charge (${fb.distance_km ?? b.distance_km} km)`} value={`₹${fb.distance_charge ?? 0}`} />
          {fb.return_discount ? <Row label="Return-trip discount" value={`- ₹${fb.return_discount}`} tone="success" /> : null}
          {fb.pool_discount ? <Row label="Pool discount" value={`- ₹${fb.pool_discount}`} tone="success" /> : null}
          <View style={s.hr} />
          <Row label="Total" value={`₹${total}`} bold />
        </Card>

        <Card style={s.infoCard}>
          <View style={s.infoItem}><Icon name="leaf" size={22} color={colors.success} /><Text style={s.infoValue}>{b.co2_saved} kg</Text><Text style={s.infoLabel}>CO₂ saved</Text></View>
          <View style={s.divider} />
          <View style={s.infoItem}><Icon name="clock-outline" size={22} color={colors.brandPrimary} /><Text style={s.infoValue}>{Math.round(b.duration_min)} min</Text><Text style={s.infoLabel}>Duration</Text></View>
          <View style={s.divider} />
          <View style={s.infoItem}><Icon name="map-marker-distance" size={22} color={colors.brandSecondary} /><Text style={s.infoValue}>{b.distance_km} km</Text><Text style={s.infoLabel}>Distance</Text></View>
        </Card>

        <Card style={{ gap: 6 }}>
          <Text style={s.cardLabel}>{isDriver ? "Passenger" : "Driver"}</Text>
          <Text style={s.name}>{isDriver ? b.passenger_name : b.driver_name}</Text>
          {!isDriver ? <Text style={s.muted}>{b.vehicle_model} · {b.vehicle_number}</Text> : null}
        </Card>

        {/* Payment */}
        {!paid ? (
          isDriver ? (
            <Button testID="cash-collected" title="Mark cash collected" icon="cash-check" onPress={() => payM.mutate("cash")} loading={payM.isPending} />
          ) : (
            <Card style={{ gap: spacing.md }}>
              <Text style={s.cardLabel}>Choose payment method</Text>
              <View style={s.payGrid}>
                {PAY_MODES.map((m) => (
                  <PressableScale key={m.key} testID={`pay-${m.key}`} onPress={() => setMode(m.key)} style={[s.payChip, mode === m.key && s.payChipActive]}>
                    <Icon name={m.icon as any} size={22} color={mode === m.key ? colors.onBrandPrimary : colors.onSurfaceTertiary} />
                    <Text style={[s.payText, mode === m.key && { color: colors.onBrandPrimary }]}>{m.label}</Text>
                  </PressableScale>
                ))}
              </View>
              <Button testID="pay-button" title={`Pay ₹${total}`} icon="check-circle" onPress={() => payM.mutate(mode)} loading={payM.isPending} />
            </Card>
          )
        ) : null}

        {/* Rating (passenger only, once paid) */}
        {!isDriver && paid && !b.rating ? (
          <Card style={{ gap: spacing.md, alignItems: "center" }}>
            <Text style={s.cardLabel}>Rate your driver</Text>
            <Stars value={stars} size={36} onChange={setStars} />
            <TextField testID="rating-comment" placeholder="Add a comment (optional)" value={comment} onChangeText={setComment} icon="comment-outline" />
            <Button testID="submit-rating" title="Submit rating" icon="star" onPress={() => rateM.mutate()} disabled={stars === 0} loading={rateM.isPending} />
          </Card>
        ) : null}

        {!isDriver && b.rating ? (
          <Card style={{ alignItems: "center", gap: spacing.sm }}>
            <Text style={s.cardLabel}>You rated this trip</Text>
            <Stars value={b.rating} size={28} />
          </Card>
        ) : null}

        <Button testID="summary-done" title="Done" variant="outline" icon="home" onPress={() => router.replace("/(tabs)")} />
      </ScrollView>
    </View>
  );
}

function Row({ label, value, tone, bold }: { label: string; value: string; tone?: "success"; bold?: boolean }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.breakdownRow}>
      <Text style={[s.rowLabel, bold && s.bold]}>{label}</Text>
      <Text style={[s.rowValue, bold && s.bold, tone === "success" && { color: colors.success }]}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.surface },
  scroll: { padding: spacing.xl, gap: spacing.lg },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: c.onSurface, fontSize: 18, fontWeight: "900" },
  totalWrap: { alignItems: "center", gap: spacing.xs },
  totalLabel: { color: c.muted, fontSize: 15, fontWeight: "700" },
  total: { color: c.onSurface, fontSize: 48, fontWeight: "900" },
  mapMini: { height: 160, borderRadius: radius.lg, overflow: "hidden", ...shadow.sm },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowLabel: { color: c.onSurfaceSecondary, fontSize: 15 },
  rowValue: { color: c.onSurface, fontSize: 15, fontWeight: "700" },
  bold: { fontSize: 19, fontWeight: "900" },
  hr: { height: 1, backgroundColor: c.border, marginVertical: spacing.xs },
  infoCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  infoItem: { alignItems: "center", gap: 4, flex: 1 },
  infoValue: { color: c.onSurface, fontSize: 16, fontWeight: "900" },
  infoLabel: { color: c.muted, fontSize: 12 },
  divider: { width: 1, height: 44, backgroundColor: c.border },
  cardLabel: { color: c.muted, fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  name: { color: c.onSurface, fontSize: 18, fontWeight: "800" },
  muted: { color: c.muted, fontSize: 14 },
  payGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  payChip: { width: "47%", flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.surfaceTertiary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1.5, borderColor: c.border },
  payChipActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  payText: { color: c.onSurfaceTertiary, fontWeight: "800", fontSize: 15 },
}));
