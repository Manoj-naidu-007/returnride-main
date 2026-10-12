import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Modal, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Icon } from "@/src/components/icon";
import { RouteMap } from "@/src/components/RouteMap";
import { useToast } from "@/src/components/toast";
import { Badge, Button, Card, PressableScale, TextField } from "@/src/components/ui";
import { STATUS_META } from "@/src/status";
import { makeStyles, radius, shadow, spacing, useTheme } from "@/src/theme";

export default function RideScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const isDriver = user?.role === "driver";

  const q = useQuery({ queryKey: ["booking", id], queryFn: () => api.get(`/bookings/${id}`), refetchInterval: 4000 });
  const b = q.data;

  const [otpModal, setOtpModal] = useState(false);
  const [otp, setOtp] = useState("");
  const otpRef = useRef<TextInput>(null);
  const [cancelModal, setCancelModal] = useState(false);
  const [reason, setReason] = useState("");
  const simIdx = useRef(0);

  // Redirect to trip summary when completed
  useEffect(() => {
    if (b?.status === "completed") router.replace(`/trip-summary/${id}`);
    if (b && ["cancelled", "rejected"].includes(b.status) && !isDriver) {
      toast.show("This ride was cancelled", "info");
    }
  }, [b?.status]);

  // Driver location simulation along the route
  useEffect(() => {
    if (!isDriver || !b) return;
    if (!["en_route", "in_progress"].includes(b.status)) return;
    const geom: number[][] = b.route_geometry ?? [];
    if (geom.length < 2) return;
    const timer = setInterval(async () => {
      let point: number[];
      if (b.status === "en_route") {
        point = geom[0];
      } else {
        simIdx.current = Math.min(simIdx.current + Math.max(1, Math.floor(geom.length / 12)), geom.length - 1);
        point = geom[simIdx.current];
      }
      try {
        await api.post(`/bookings/${id}/location`, { lat: point[0], lng: point[1] });
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(timer);
  }, [isDriver, b?.status, id]);

  const mutate = useMutation({
    mutationFn: ({ status, reason }: { status: string; reason?: string }) => api.post(`/bookings/${id}/status`, { status, reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["booking", id] }); qc.invalidateQueries({ queryKey: ["bookings", "mine"] }); },
    onError: (e: any) => toast.show(e?.message ?? "Action failed", "error"),
  });

  const startM = useMutation({
    mutationFn: () => api.post(`/bookings/${id}/start`, { otp: otp.trim() }),
    onSuccess: () => { setOtpModal(false); setOtp(""); toast.show("Ride started!", "success"); qc.invalidateQueries({ queryKey: ["booking", id] }); },
    onError: (e: any) => { toast.show(e?.message ?? "Wrong OTP", "error"); setOtp(""); },
  });

  const completeM = useMutation({
    mutationFn: () => {
      const geom: number[][] = b.route_geometry ?? [];
      const last = geom.length ? geom[geom.length - 1] : [b.drop.lat, b.drop.lng];
      return api.post(`/bookings/${id}/complete`, { driver_lat: last[0], driver_lng: last[1] });
    },
    onSuccess: () => { toast.show("Ride completed", "success"); qc.invalidateQueries({ queryKey: ["booking", id] }); router.replace(`/trip-summary/${id}`); },
    onError: (e: any) => toast.show(e?.message ?? "Could not complete", "error"),
  });

  const regenM = useMutation({
    mutationFn: () => api.post(`/bookings/${id}/otp/regenerate`),
    onSuccess: () => { toast.show("New OTP generated", "success"); qc.invalidateQueries({ queryKey: ["booking", id] }); },
    onError: (e: any) => toast.show(e?.message ?? "Failed", "error"),
  });

  if (q.isLoading || !b) {
    return <View style={s.loader}><ActivityIndicator size="large" color={colors.brandPrimary} /></View>;
  }

  const driverLoc = b.driver_location ? { lat: b.driver_location.lat, lng: b.driver_location.lng, heading: b.driver_location.heading } : null;
  const meta = STATUS_META[b.status];
  const canCancel = ["requested", "accepted", "en_route", "arrived"].includes(b.status);

  const navTarget = b.status === "in_progress" ? b.drop : b.pickup;
  const openMaps = () => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${navTarget.lat},${navTarget.lng}`);

  return (
    <View style={s.container}>
      <View style={s.mapWrap}>
        <RouteMap
          origin={b.pickup}
          destination={b.drop}
          driverLocation={driverLoc}
          routeGeometry={b.route_geometry}
          fitToRoute={!driverLoc}
          interactive={false}
        />
        <PressableScale testID="ride-back" onPress={() => router.replace("/(tabs)")} style={[s.iconBtn, { top: insets.top + spacing.sm }]}>
          <Icon name="arrow-left" size={24} color={colors.onSurface} />
        </PressableScale>
        <View style={[s.statusChip, { top: insets.top + spacing.sm }]}>
          <Icon name={(meta?.icon ?? "clock-outline") as any} size={16} color={colors.brandPrimary} />
          <Text style={s.statusChipText}>{meta?.label ?? b.status}</Text>
        </View>
      </View>

      <ScrollView style={s.sheet} contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xl }} showsVerticalScrollIndicator={false}>
        <View style={s.handle} />

        {/* OTP for passenger */}
        {!isDriver && ["requested", "accepted", "en_route", "arrived"].includes(b.status) && b.otp ? (
          <Card style={s.otpCard}>
            <Text style={s.otpTitle}>Start-ride OTP</Text>
            <Text style={s.otpHint}>Share with your driver only when you board</Text>
            <View style={s.otpBoxes}>
              {String(b.otp).padStart(4, "0").split("").map((d: string, i: number) => (
                <View key={i} style={s.otpBox} testID={`otp-digit-${i}`}><Text style={s.otpDigit}>{d}</Text></View>
              ))}
            </View>
            <PressableScale testID="regenerate-otp" onPress={() => regenM.mutate()} style={s.regen}>
              <Icon name="refresh" size={16} color={colors.brandPrimary} />
              <Text style={s.regenText}>Generate new OTP</Text>
            </PressableScale>
          </Card>
        ) : null}

        {/* Driver / vehicle info */}
        <Card style={{ gap: spacing.md }}>
          <View style={s.rowBetween}>
            <View style={s.person}>
              <View style={s.avatar}><Icon name="account" size={24} color="#FFFFFF" /></View>
              <View>
                <Text style={s.personName}>{isDriver ? b.passenger_name : b.driver_name}</Text>
                <Text style={s.muted}>{isDriver ? `+91 ${b.passenger_phone}` : `${b.vehicle_model} · ${b.vehicle_number}`}</Text>
              </View>
            </View>
            <Badge label={`₹${b.final_fare ?? b.estimated_fare}`} tone="brand" />
          </View>
          <View style={s.routeLine}>
            <View style={{ alignItems: "center" }}>
              <View style={[s.dot, { backgroundColor: colors.success }]} />
              <View style={s.line} />
              <Icon name="map-marker" size={16} color={colors.error} />
            </View>
            <View style={{ flex: 1, gap: spacing.md }}>
              <Text style={s.addr} numberOfLines={1}>{b.pickup?.address}</Text>
              <Text style={s.addr} numberOfLines={1}>{b.drop?.address}</Text>
            </View>
          </View>
          <Text style={s.muted}>{b.distance_km} km · about {Math.round(b.duration_min)} min</Text>
        </Card>

        {/* Driver actions */}
        {isDriver ? (
          <View style={{ gap: spacing.md }}>
            {["en_route", "arrived", "in_progress"].includes(b.status) ? (
              <Button testID="open-google-maps" title="Open in Google Maps" variant="outline" icon="navigation" onPress={openMaps} />
            ) : null}
            {b.status === "accepted" ? (
              <Button testID="btn-en-route" title="I'm on my way" icon="car" onPress={() => mutate.mutate({ status: "en_route" })} loading={mutate.isPending} />
            ) : null}
            {b.status === "en_route" ? (
              <Button testID="btn-arrived" title="I've arrived at pickup" icon="map-marker-check" onPress={() => mutate.mutate({ status: "arrived" })} loading={mutate.isPending} />
            ) : null}
            {b.status === "arrived" ? (
              <Button testID="btn-start" title="Enter OTP & start ride" icon="lock-open-check" onPress={() => setOtpModal(true)} />
            ) : null}
            {b.status === "in_progress" ? (
              <Button testID="btn-complete" title="Complete ride" icon="flag-checkered" onPress={() => completeM.mutate()} loading={completeM.isPending} />
            ) : null}
          </View>
        ) : null}

        {canCancel ? (
          <Button testID="btn-cancel" title="Cancel ride" variant="ghost" icon="close-circle" onPress={() => setCancelModal(true)} />
        ) : null}
      </ScrollView>

      {/* OTP modal */}
      <Modal visible={otpModal} transparent animationType="fade" onShow={() => setTimeout(() => otpRef.current?.focus(), 100)} onRequestClose={() => setOtpModal(false)}>
        <View style={s.modalBg}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Enter start-ride OTP</Text>
            <Text style={s.muted}>Ask the passenger for their 4-digit code</Text>
            <View style={[s.otpBoxes, { position: "relative" }]}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={[s.otpBox, otp.length === i && s.otpBoxActive]}><Text style={s.otpDigit}>{otp[i] ?? ""}</Text></View>
              ))}
              <TextInput
                ref={otpRef}
                testID="otp-input"
                value={otp}
                onChangeText={(t) => setOtp(t.replace(/[^0-9]/g, "").slice(0, 4))}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={4}
                autoFocus
                caretHidden
                style={s.otpOverlayInput}
              />
            </View>
            <Button testID="otp-submit" title="Start ride" icon="check" onPress={() => startM.mutate()} loading={startM.isPending} disabled={otp.length !== 4} />
            <Button title="Cancel" variant="ghost" onPress={() => { setOtpModal(false); setOtp(""); }} />
          </View>
        </View>
      </Modal>

      {/* Cancel modal */}
      <Modal visible={cancelModal} transparent animationType="fade" onRequestClose={() => setCancelModal(false)}>
        <View style={s.modalBg}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Cancel this ride?</Text>
            <TextField testID="cancel-reason-input" label="Reason (required)" placeholder="Why are you cancelling?" value={reason} onChangeText={setReason} icon="comment-alert" />
            <Button
              testID="confirm-cancel"
              title="Confirm cancellation"
              variant="danger"
              onPress={() => {
                if (!reason.trim()) { toast.show("Please enter a reason", "error"); return; }
                mutate.mutate({ status: "cancelled", reason }, { onSuccess: () => { setCancelModal(false); toast.show("Ride cancelled", "info"); router.replace("/(tabs)"); } });
              }}
              loading={mutate.isPending}
            />
            <Button title="Keep ride" variant="ghost" onPress={() => setCancelModal(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.surface },
  mapWrap: { height: "42%" },
  iconBtn: { position: "absolute", left: spacing.lg, width: 46, height: 46, borderRadius: 23, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", ...shadow.md },
  statusChip: { position: "absolute", right: spacing.lg, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.surface, paddingHorizontal: spacing.md, height: 40, borderRadius: radius.pill, ...shadow.md },
  statusChipText: { color: c.onSurface, fontWeight: "800", fontSize: 14 },
  sheet: { flex: 1, marginTop: -spacing.xl, backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, ...shadow.lg },
  handle: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: c.border },
  otpCard: { alignItems: "center", gap: spacing.sm, backgroundColor: c.surfaceInverse, borderColor: c.surfaceInverse },
  otpTitle: { color: c.onSurfaceInverse, fontSize: 16, fontWeight: "800" },
  otpHint: { color: "#D8C9BC", fontSize: 13, textAlign: "center" },
  otpBoxes: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xs },
  otpBox: { width: 56, height: 66, borderRadius: radius.md, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.brandSecondary, ...shadow.sm },
  otpBoxActive: { borderColor: c.brandPrimary },
  otpDigit: { color: c.onSurface, fontSize: 30, fontWeight: "900" },
  regen: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
  regenText: { color: c.brandPrimary, fontWeight: "800", fontSize: 14 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  person: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  personName: { color: c.onSurface, fontSize: 17, fontWeight: "800" },
  muted: { color: c.muted, fontSize: 14 },
  routeLine: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  dot: { width: 14, height: 14, borderRadius: 7 },
  line: { width: 2, height: 24, backgroundColor: c.border, marginVertical: 2 },
  addr: { color: c.onSurface, fontSize: 14, fontWeight: "600" },
  modalBg: { flex: 1, backgroundColor: "rgba(44,30,22,0.6)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  modalCard: { width: "100%", maxWidth: 420, backgroundColor: c.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md, ...shadow.lg },
  modalTitle: { color: c.onSurface, fontSize: 20, fontWeight: "900" },
  otpOverlayInput: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.02, color: "transparent", fontSize: 30 } as any,
  hiddenInput: { position: "absolute", opacity: 0, height: 1, width: 1 },
}));