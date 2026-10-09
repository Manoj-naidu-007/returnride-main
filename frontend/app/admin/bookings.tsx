import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, ScrollView, Text, View } from "react-native";

import { api } from "@/src/api";
import { AdminShell } from "@/src/components/admin-shell";
import { Icon } from "@/src/components/icon";
import { RouteMap } from "@/src/components/RouteMap";
import { useToast } from "@/src/components/toast";
import { Badge, Button, Card, Chip, EmptyState, PressableScale, TextField } from "@/src/components/ui";
import { STATUS_META } from "@/src/status";
import { makeStyles, radius, shadow, spacing, useTheme } from "@/src/theme";

const FILTERS = ["all", "requested", "accepted", "in_progress", "completed", "cancelled"];

export default function AdminBookings() {
  const s = useStyles();
  const [status, setStatus] = useState("all");
  const [focusId, setFocusId] = useState<string | null>(null);
  const { focus } = useLocalSearchParams<{ focus?: string }>();

  useEffect(() => { if (focus) setFocusId(focus); }, [focus]);

  const params = status === "all" ? "limit=100" : `status=${status}&limit=100`;
  const bookingsQ = useQuery({
    queryKey: ["admin", "bookings", status],
    queryFn: () => api.get(`/admin/bookings?${params}`),
    refetchInterval: 6000,
  });
  const bookings = bookingsQ.data?.bookings ?? [];

  return (
    <AdminShell active="bookings" title="Rides & Bookings">
      <View style={s.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          {FILTERS.map((f) => <Chip key={f} testID={`bstatus-${f}`} label={f.replace("_", " ")} active={status === f} onPress={() => setStatus(f)} />)}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
        <Text style={s.count}>{bookingsQ.data?.total ?? 0} bookings</Text>
        {bookings.length === 0 ? (
          <EmptyState icon="car-off" title="No bookings" />
        ) : (
          bookings.map((b: any) => (
            <PressableScale key={b.id} testID={`booking-${b.id}`} onPress={() => setFocusId(b.id)}>
              <Card style={{ gap: spacing.sm }}>
                <View style={s.rowBetween}>
                  <Text style={s.title} numberOfLines={1}>{b.passenger_name} · {b.driver_name}</Text>
                  <Badge label={STATUS_META[b.status]?.label ?? b.status} tone={STATUS_META[b.status]?.tone ?? "muted"} />
                </View>
                <Text style={s.muted} numberOfLines={1}>{b.pickup?.address?.split(",")[0]} → {b.drop?.address?.split(",")[0]}</Text>
                <View style={s.rowBetween}>
                  <Text style={s.muted}>{b.distance_km} km · {b.pooled ? "Pooled" : "Private"}</Text>
                  <Text style={s.fare}>₹{b.final_fare ?? b.estimated_fare}</Text>
                </View>
              </Card>
            </PressableScale>
          ))
        )}
        <View style={{ height: spacing["2xl"] }} />
      </ScrollView>

      {focusId ? <BookingDetail id={focusId} onClose={() => setFocusId(null)} /> : null}
    </AdminShell>
  );
}

function BookingDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const detailQ = useQuery({ queryKey: ["admin", "booking", id], queryFn: () => api.get(`/admin/bookings/${id}`) });
  const b = detailQ.data?.booking;
  const timeline = detailQ.data?.timeline ?? [];
  const fb = b?.fare_breakdown ?? {};

  const cancelM = useMutation({
    mutationFn: () => api.post(`/admin/bookings/${id}/cancel`, { reason }),
    onSuccess: () => { toast.show("Booking force-cancelled", "info"); qc.invalidateQueries({ queryKey: ["admin", "bookings"] }); qc.invalidateQueries({ queryKey: ["admin", "booking", id] }); onClose(); },
    onError: (e: any) => toast.show(e?.message ?? "Failed", "error"),
  });

  const closed = b && ["completed", "cancelled", "rejected"].includes(b.status);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.bg}>
        <View style={s.drawer}>
          <View style={s.drawerHeader}>
            <Text style={s.drawerTitle}>Booking detail</Text>
            <PressableScale testID="detail-close" onPress={onClose} style={s.closeBtn}><Icon name="close" size={22} color={colors.onSurface} /></PressableScale>
          </View>
          {!b ? (
            <View style={{ padding: spacing.xl }}><Text style={s.muted}>Loading…</Text></View>
          ) : (
            <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }} showsVerticalScrollIndicator={false}>
              <View style={s.map}>
                <RouteMap origin={b.pickup} destination={b.drop} routeGeometry={b.route_geometry} fitToRoute interactive={false} />
              </View>

              <View style={s.badgeRow}>
                <Badge label={STATUS_META[b.status]?.label ?? b.status} tone={STATUS_META[b.status]?.tone ?? "muted"} />
                <Badge label={b.payment_status === "paid" ? `Paid · ${b.payment_mode}` : "Unpaid"} tone={b.payment_status === "paid" ? "success" : "warning"} />
                <Badge label={`OTP: ${b.otp_result}`} tone={b.otp_result === "verified" ? "success" : b.otp_result === "failed" ? "error" : "muted"} />
              </View>

              <Card style={{ gap: 4 }}>
                <Text style={s.label}>People</Text>
                <Text style={s.info}>Passenger: {b.passenger_name} (+91 {b.passenger_phone})</Text>
                <Text style={s.info}>Driver: {b.driver_name} · {b.vehicle_model}</Text>
              </Card>

              <Card style={{ gap: 4 }}>
                <Text style={s.label}>Fare breakdown</Text>
                <Text style={s.info}>Base ₹{fb.base_fare ?? 0} + distance ₹{fb.distance_charge ?? 0}</Text>
                {fb.return_discount ? <Text style={s.info}>Return discount − ₹{fb.return_discount}</Text> : null}
                {fb.pool_discount ? <Text style={s.info}>Pool discount − ₹{fb.pool_discount}</Text> : null}
                <Text style={s.total}>Total ₹{b.final_fare ?? b.estimated_fare}</Text>
              </Card>

              <Card style={{ gap: spacing.sm }}>
                <Text style={s.label}>Timeline</Text>
                {timeline.length === 0 ? <Text style={s.muted}>No events.</Text> : timeline.map((t: any, i: number) => (
                  <View key={i} style={s.tl}>
                    <View style={[s.tlDot, { backgroundColor: STATUS_META[t.status]?.tone === "error" ? colors.error : colors.success }]} />
                    <Text style={s.tlText}>{STATUS_META[t.status]?.label ?? t.status}</Text>
                    <Text style={s.tlTime}>{new Date(t.created_at).toLocaleString()}</Text>
                  </View>
                ))}
              </Card>

              {b.cancel_reason ? (
                <Card><Text style={s.label}>Cancelled by {b.cancelled_by}</Text><Text style={s.info}>{b.cancel_reason}</Text></Card>
              ) : null}

              {!closed ? (
                <>
                  <TextField testID="force-cancel-reason" label="Force-cancel reason" placeholder="Reason" value={reason} onChangeText={setReason} icon="comment-alert" />
                  <Button testID="force-cancel" title="Force cancel booking" variant="danger" icon="close-circle" onPress={() => { if (!reason.trim()) { toast.show("Enter a reason", "error"); return; } cancelM.mutate(); }} loading={cancelM.isPending} />
                </>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  filters: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.border },
  chipRow: { gap: spacing.sm },
  list: { padding: spacing.xl, gap: spacing.md, maxWidth: 900, width: "100%", alignSelf: "center" },
  count: { color: c.muted, fontSize: 13, fontWeight: "700" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  title: { color: c.onSurface, fontSize: 15, fontWeight: "800", flex: 1 },
  muted: { color: c.muted, fontSize: 13 },
  fare: { color: c.brandPrimary, fontSize: 16, fontWeight: "900" },
  bg: { flex: 1, backgroundColor: "rgba(44,30,22,0.6)", justifyContent: "flex-end" },
  drawer: { maxHeight: "92%", backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, ...shadow.lg },
  drawerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  drawerTitle: { color: c.onSurface, fontSize: 20, fontWeight: "900" },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  map: { height: 160, borderRadius: radius.md, overflow: "hidden" },
  badgeRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  label: { color: c.muted, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  info: { color: c.onSurfaceSecondary, fontSize: 14 },
  total: { color: c.brandPrimary, fontSize: 18, fontWeight: "900", marginTop: 4 },
  tl: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  tlDot: { width: 8, height: 8, borderRadius: 4 },
  tlText: { color: c.onSurface, fontSize: 14, fontWeight: "700", flex: 1 },
  tlTime: { color: c.muted, fontSize: 12 },
}));
