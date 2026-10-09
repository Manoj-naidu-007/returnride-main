import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Icon } from "@/src/components/icon";
import { RouteMap } from "@/src/components/RouteMap";
import { useToast } from "@/src/components/toast";
import { Badge, Button, Card, EmptyState, PressableScale } from "@/src/components/ui";
import { makeStyles, radius, shadow, spacing, useTheme } from "@/src/theme";

export default function Matches() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ pickup: string; drop: string; distance_km: string; duration_min: string }>();

  const pickup = JSON.parse(params.pickup ?? "{}");
  const drop = JSON.parse(params.drop ?? "{}");
  const durationMin = Number(params.duration_min ?? 0);

  const routeQ = useQuery({
    queryKey: ["route", pickup.lat, drop.lat],
    queryFn: () => api.post("/maps/route", { origin_lat: pickup.lat, origin_lng: pickup.lng, dest_lat: drop.lat, dest_lng: drop.lng }),
  });
  const matchQ = useQuery({
    queryKey: ["match", pickup.lat, drop.lat],
    queryFn: () => api.post("/rides/match", { pickup, drop }),
  });

  const geometry = routeQ.data?.geometry ?? [];
  const matches = matchQ.data?.matches ?? [];
  const [pool, setPool] = useState(false);

  const bookM = useMutation({
    mutationFn: (ride: any) =>
      api.post("/bookings", {
        ride_id: ride.id,
        pickup, drop,
        distance_km: ride.segment_km,
        duration_min: durationMin || Math.round((ride.segment_km / 40) * 60),
        route_geometry: geometry,
        pooled: pool,
      }),
    onSuccess: (booking: any) => {
      toast.show("Ride booked! Share the OTP when you board.", "success");
      qc.invalidateQueries({ queryKey: ["bookings", "mine"] });
      router.replace(`/ride/${booking.id}`);
    },
    onError: (e: any) => toast.show(e?.message ?? "Could not book", "error"),
  });

  return (
    <View style={s.container}>
      <View style={s.mapWrap}>
        <RouteMap origin={pickup} destination={drop} routeGeometry={geometry} fitToRoute interactive={false} />
        <PressableScale testID="matches-back" onPress={() => router.back()} style={[s.iconBtn, { top: insets.top + spacing.sm }]}>
          <Icon name="arrow-left" size={24} color={colors.onSurface} />
        </PressableScale>
      </View>

      <View style={s.sheet}>
        <View style={s.handle} />
        <Text style={s.title}>Return rides on your route</Text>
        <Text style={s.subtitle}>{matches.length} driver{matches.length === 1 ? "" : "s"} heading your way</Text>

        <View style={s.poolRow} testID="pool-toggle-row">
          <View style={{ flex: 1 }}>
            <Text style={s.poolTitle}>🤝 Share ride & save</Text>
            <Text style={s.poolHint}>Pool with other riders on the same trip for 12% off</Text>
          </View>
          <Switch testID="pool-switch" value={pool} onValueChange={setPool} trackColor={{ true: colors.brandPrimary }} />
        </View>

        <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }} showsVerticalScrollIndicator={false}>
          {matchQ.isLoading ? (
            <View style={{ padding: spacing["2xl"], alignItems: "center" }}>
              <ActivityIndicator size="large" color={colors.brandPrimary} />
            </View>
          ) : matches.length === 0 ? (
            <EmptyState icon="car-off" title="No rides found nearby" subtitle="No drivers are returning along this route right now. Try again later." />
          ) : (
            matches.map((m: any) => (
              <Card key={m.id} style={{ gap: spacing.sm }}>
                <View style={s.rowBetween}>
                  <View style={s.driver}>
                    <View style={s.avatar}><Icon name="account" size={22} color="#FFFFFF" /></View>
                    <View>
                      <Text style={s.driverName}>{m.driver_name}</Text>
                      <Text style={s.muted}>⭐ {Number(m.driver_rating).toFixed(1)} · {m.vehicle_model}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    {pool ? <Text style={s.strike}>₹{m.estimated_fare}</Text> : null}
                    <Text style={s.fare} testID={`fare-${m.id}`}>₹{pool ? m.estimated_fare_pooled : m.estimated_fare}</Text>
                  </View>
                </View>

                <View style={s.tags}>
                  <Badge label={`${m.segment_km} km`} tone="muted" />
                  <Badge label={`${m.seats_available} seats`} tone="muted" />
                  {m.co_riders > 0 ? <Badge label={`${m.co_riders} rider${m.co_riders === 1 ? "" : "s"} on board`} tone="brand" /> : null}
                  {pool ? <Badge label={`Save ₹${m.pooled_savings}`} tone="success" /> : null}
                  {m.is_return ? <Badge label="Return · 25% off" tone="success" /> : null}
                  {m.women_only ? <Badge label="Women only" tone="brand" /> : null}
                </View>

                <Button
                  testID={`book-${m.id}`}
                  title={bookM.isPending ? "Booking…" : pool ? "Book & share ride" : "Book this ride"}
                  icon="check-circle"
                  onPress={() => bookM.mutate(m)}
                  loading={bookM.isPending}
                />
              </Card>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  mapWrap: { height: "40%" },
  iconBtn: { position: "absolute", left: spacing.lg, width: 46, height: 46, borderRadius: 23, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", ...shadow.md },
  sheet: { flex: 1, marginTop: -spacing.xl, backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, gap: spacing.xs, ...shadow.lg },
  handle: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: c.border, marginBottom: spacing.sm },
  title: { color: c.onSurface, fontSize: 20, fontWeight: "900" },
  subtitle: { color: c.muted, fontSize: 14, marginBottom: spacing.sm },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  driver: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  driverName: { color: c.onSurface, fontSize: 16, fontWeight: "800" },
  muted: { color: c.muted, fontSize: 13 },
  fare: { color: c.brandPrimary, fontSize: 20, fontWeight: "900" },
  strike: { color: c.muted, fontSize: 13, textDecorationLine: "line-through" },
  poolRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  poolTitle: { color: c.onSurface, fontSize: 15, fontWeight: "800" },
  poolHint: { color: c.muted, fontSize: 13 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
}));
