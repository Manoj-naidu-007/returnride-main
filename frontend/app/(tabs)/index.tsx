import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Icon } from "@/src/components/icon";
import { useToast } from "@/src/components/toast";
import { Badge, Button, Card, EmptyState, PressableScale } from "@/src/components/ui";
import { STATUS_META } from "@/src/status";
import { makeStyles, radius, shadow, spacing, useTheme } from "@/src/theme";

const ACTIVE = ["requested", "accepted", "en_route", "arrived", "in_progress"];

export default function Home() {
  const { user } = useAuth();
  return user?.role === "driver" ? <DriverHome /> : <PassengerHome />;
}

function Header({ subtitle }: { subtitle: string }) {
  const s = useStyles();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.hi}>Namaste, {user?.name?.split(" ")[0]} 👋</Text>
        <Text style={s.sub}>{subtitle}</Text>
      </View>
      <PressableScale testID="profile-quick" onPress={() => router.push("/(tabs)/profile")} style={s.avatar}>
        <Icon name="account" size={24} color="#FFFFFF" />
      </PressableScale>
    </View>
  );
}

function PassengerHome() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const bookingsQ = useQuery({ queryKey: ["bookings", "mine"], queryFn: () => api.get("/bookings/mine"), refetchInterval: 8000 });
  const villagesQ = useQuery({ queryKey: ["villages"], queryFn: () => api.get("/villages") });

  const bookings = bookingsQ.data?.bookings ?? [];
  const active = bookings.find((b: any) => ACTIVE.includes(b.status));
  const recent = bookings.filter((b: any) => !ACTIVE.includes(b.status)).slice(0, 3);
  const villages = villagesQ.data?.villages ?? [];

  return (
    <View style={s.container}>
      <Header subtitle="Where would you like to go today?" />
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={bookingsQ.isRefetching} onRefresh={() => qc.invalidateQueries({ queryKey: ["bookings", "mine"] })} tintColor={colors.brandPrimary} />}
      >
        <PressableScale testID="book-ride-cta" hapticKind="medium" onPress={() => router.push("/location-picker")} style={s.bookCard}>
          <Image source={{ uri: "https://images.pexels.com/photos/12923128/pexels-photo-12923128.jpeg?auto=compress&cs=tinysrgb&w=900" }} style={s.bookImg} contentFit="cover" />
          <View style={s.bookOverlay} />
          <View style={s.bookContent}>
            <Text style={s.bookTitle}>Book a return ride</Text>
            <Text style={s.bookSub}>Pick your spot on the map & find a driver heading your way</Text>
            <View style={s.bookBtn}>
              <Icon name="map-marker-plus" size={18} color={colors.onBrandPrimary} />
              <Text style={s.bookBtnText}>Set pickup & drop</Text>
            </View>
          </View>
        </PressableScale>

        {active ? (
          <PressableScale testID="active-booking-card" onPress={() => router.push(`/ride/${active.id}`)}>
            <Card style={s.activeCard}>
              <View style={s.rowBetween}>
                <Text style={s.cardLabel}>Active ride</Text>
                <Badge label={STATUS_META[active.status]?.label ?? active.status} tone={STATUS_META[active.status]?.tone ?? "brand"} />
              </View>
              <Text style={s.route} numberOfLines={1}>{active.pickup?.address?.split(",")[0]} → {active.drop?.address?.split(",")[0]}</Text>
              <View style={s.rowBetween}>
                <Text style={s.muted}>{active.driver_name} · {active.vehicle_model}</Text>
                <Text style={s.tapView}>View →</Text>
              </View>
            </Card>
          </PressableScale>
        ) : null}

        <Text style={s.section}>Popular landmarks</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          {villages.map((v: any) => (
            <View key={v.id} style={s.landmark}>
              <Icon name={v.type === "temple" ? "temple-hindu" : v.type === "market" ? "storefront" : "bus-stop"} size={22} color={colors.brandPrimary} />
              <Text style={s.landmarkText} numberOfLines={1}>{v.name}</Text>
            </View>
          ))}
        </ScrollView>

        <Text style={s.section}>Recent trips</Text>
        {recent.length === 0 ? (
          <EmptyState icon="road-variant" title="No trips yet" subtitle="Your completed rides will appear here." />
        ) : (
          recent.map((b: any) => <TripRow key={b.id} b={b} onPress={() => router.push(b.status === "completed" ? `/trip-summary/${b.id}` : `/ride/${b.id}`)} />)
        )}
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

function DriverHome() {
  const s = useStyles();
  const { colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();

  const incomingQ = useQuery({ queryKey: ["incoming"], queryFn: () => api.get("/bookings/incoming"), refetchInterval: 5000 });
  const ridesQ = useQuery({ queryKey: ["rides", "mine"], queryFn: () => api.get("/rides/mine"), refetchInterval: 10000 });
  const bookingsQ = useQuery({ queryKey: ["bookings", "mine"], queryFn: () => api.get("/bookings/mine"), refetchInterval: 6000 });

  const incoming = incomingQ.data?.bookings ?? [];
  const rides = ridesQ.data?.rides ?? [];
  const active = (bookingsQ.data?.bookings ?? []).filter((b: any) => ["accepted", "en_route", "arrived", "in_progress"].includes(b.status));

  const respond = async (id: string, status: "accepted" | "rejected") => {
    try {
      await api.post(`/bookings/${id}/status`, { status });
      toast.show(status === "accepted" ? "Ride accepted!" : "Request declined", status === "accepted" ? "success" : "info");
      qc.invalidateQueries({ queryKey: ["incoming"] });
      qc.invalidateQueries({ queryKey: ["bookings", "mine"] });
      if (status === "accepted") router.push(`/ride/${id}`);
    } catch (e: any) {
      toast.show(e?.message ?? "Failed", "error");
    }
  };

  return (
    <View style={s.container}>
      <Header subtitle={`⭐ ${user?.rating?.toFixed(1) ?? "5.0"} · ${user?.vehicle_model ?? "Driver"}`} />
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={incomingQ.isRefetching} onRefresh={() => { qc.invalidateQueries({ queryKey: ["incoming"] }); qc.invalidateQueries({ queryKey: ["rides", "mine"] }); }} tintColor={colors.brandPrimary} />}
      >
        <Card style={{ gap: spacing.md }}>
          <Text style={s.cardLabel}>Offer a return trip</Text>
          <Text style={s.muted}>Publish your route and let passengers along the way ride with you.</Text>
          <Button testID="publish-ride-cta" title="Publish a ride" icon="map-marker-path" onPress={() => router.push("/publish")} />
        </Card>

        {active.length > 0 ? (
          <>
            <Text style={s.section}>Ongoing trips</Text>
            {active.map((b: any) => (
              <PressableScale key={b.id} testID={`active-trip-${b.id}`} onPress={() => router.push(`/ride/${b.id}`)}>
                <Card style={s.activeCard}>
                  <View style={s.rowBetween}>
                    <Text style={s.route} numberOfLines={1}>{b.passenger_name}</Text>
                    <Badge label={STATUS_META[b.status]?.label ?? b.status} tone={STATUS_META[b.status]?.tone ?? "brand"} />
                  </View>
                  <Text style={s.muted} numberOfLines={1}>{b.pickup?.address?.split(",")[0]} → {b.drop?.address?.split(",")[0]}</Text>
                  <Text style={s.tapView}>Manage trip →</Text>
                </Card>
              </PressableScale>
            ))}
          </>
        ) : null}

        <Text style={s.section}>Incoming requests</Text>
        {incoming.length === 0 ? (
          <EmptyState icon="bell-outline" title="No new requests" subtitle="Requests from passengers on your route show up here." />
        ) : (
          incoming.map((b: any) => (
            <Card key={b.id} style={{ gap: spacing.sm }}>
              <View style={s.rowBetween}>
                <Text style={s.route} numberOfLines={1}>{b.passenger_name}</Text>
                <Text style={s.fare}>₹{b.estimated_fare}</Text>
              </View>
              <Text style={s.muted} numberOfLines={1}>{b.pickup?.address?.split(",")[0]} → {b.drop?.address?.split(",")[0]}</Text>
              <Text style={s.muted}>{b.distance_km} km · {b.pooled ? "Pooled" : "Private"}</Text>
              <View style={s.actionRow}>
                <View style={{ flex: 1 }}>
                  <Button testID={`accept-${b.id}`} title="Accept" icon="check" onPress={() => respond(b.id, "accepted")} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button testID={`reject-${b.id}`} title="Decline" variant="outline" onPress={() => respond(b.id, "rejected")} />
                </View>
              </View>
            </Card>
          ))
        )}

        <Text style={s.section}>My published rides</Text>
        {rides.length === 0 ? (
          <EmptyState icon="map-marker-path" title="No rides published" subtitle="Publish a ride to start matching." />
        ) : (
          rides.map((r: any) => (
            <Card key={r.id} style={{ gap: 6 }}>
              <View style={s.rowBetween}>
                <Text style={s.route} numberOfLines={1}>{r.origin?.address?.split(",")[0]} → {r.dest?.address?.split(",")[0]}</Text>
                <Badge label={r.status} tone={r.status === "active" ? "success" : "muted"} />
              </View>
              <Text style={s.muted}>{r.distance_km} km · {r.seats_available}/{r.seats_total} seats · {r.bookings_count} booked</Text>
            </Card>
          ))
        )}
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

function TripRow({ b, onPress }: { b: any; onPress: () => void }) {
  const s = useStyles();
  return (
    <PressableScale testID={`trip-row-${b.id}`} onPress={onPress}>
      <Card style={{ gap: 6, marginBottom: spacing.md }}>
        <View style={s.rowBetween}>
          <Text style={s.route} numberOfLines={1}>{b.pickup?.address?.split(",")[0]} → {b.drop?.address?.split(",")[0]}</Text>
          <Badge label={STATUS_META[b.status]?.label ?? b.status} tone={STATUS_META[b.status]?.tone ?? "muted"} />
        </View>
        <View style={s.rowBetween}>
          <Text style={s.muted}>{b.driver_name}</Text>
          <Text style={s.fare}>₹{b.final_fare ?? b.estimated_fare}</Text>
        </View>
      </Card>
    </PressableScale>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, gap: spacing.md, backgroundColor: c.surface },
  hi: { color: c.onSurface, fontSize: 22, fontWeight: "900" },
  sub: { color: c.muted, fontSize: 14, marginTop: 2 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", ...shadow.sm },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.lg, paddingTop: spacing.sm },
  bookCard: { height: 190, borderRadius: radius.lg, overflow: "hidden", justifyContent: "flex-end", ...shadow.md },
  bookImg: { ...({ position: "absolute" } as any), top: 0, left: 0, right: 0, bottom: 0 },
  bookOverlay: { ...({ position: "absolute" } as any), top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(44,30,22,0.45)" },
  bookContent: { padding: spacing.xl, gap: spacing.sm },
  bookTitle: { color: "#FFFFFF", fontSize: 24, fontWeight: "900" },
  bookSub: { color: "#F3EBE1", fontSize: 14, fontWeight: "600", maxWidth: 300 },
  bookBtn: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", backgroundColor: c.brandPrimary, paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.pill, marginTop: spacing.xs },
  bookBtnText: { color: c.onBrandPrimary, fontWeight: "800", fontSize: 14 },
  activeCard: { gap: spacing.sm, borderColor: c.brandPrimary, borderWidth: 1.5 },
  cardLabel: { color: c.muted, fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  route: { color: c.onSurface, fontSize: 16, fontWeight: "800", flex: 1 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  muted: { color: c.muted, fontSize: 14 },
  fare: { color: c.brandPrimary, fontSize: 17, fontWeight: "900" },
  tapView: { color: c.brandPrimary, fontSize: 14, fontWeight: "800" },
  section: { color: c.onSurface, fontSize: 18, fontWeight: "900", marginTop: spacing.xs },
  chipRow: { gap: spacing.md, paddingRight: spacing.xl },
  landmark: { width: 120, gap: 6, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border },
  landmarkText: { color: c.onSurface, fontSize: 13, fontWeight: "700" },
  actionRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xs },
}));
