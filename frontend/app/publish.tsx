import { useMutation } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Icon } from "@/src/components/icon";
import { RouteMap } from "@/src/components/RouteMap";
import { INDIA_CENTER, type LatLng } from "@/src/components/route-map-types";
import { useToast } from "@/src/components/toast";
import { Button, Card, Chip, PressableScale } from "@/src/components/ui";
import { getCurrentLocation } from "@/src/hooks/use-current-location";
import { makeStyles, radius, shadow, spacing, useTheme } from "@/src/theme";

type Picked = LatLng & { address: string };
type Step = "origin" | "dest" | "form";

const DEPART = [
  { key: "now", label: "Leaving now", h: 0 },
  { key: "1h", label: "In 1 hour", h: 1 },
  { key: "2h", label: "In 2 hours", h: 2 },
  { key: "3h", label: "In 3 hours", h: 3 },
];

export default function Publish() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>("origin");
  const [center, setCenter] = useState<LatLng>(INDIA_CENTER);
  const [address, setAddress] = useState("Move the map to set origin");
  const [resolving, setResolving] = useState(false);
  const [mapKey, setMapKey] = useState(0);
  const [origin, setOrigin] = useState<Picked | null>(null);
  const [dest, setDest] = useState<Picked | null>(null);
  const [route, setRoute] = useState<any>(null);
  const revTimer = useRef<any>(null);

  const [seats, setSeats] = useState(3);
  const [depart, setDepart] = useState("now");
  const [womenOnly, setWomenOnly] = useState(false);
  const [recurring, setRecurring] = useState(false);

  const villagesQ = useQuery({ queryKey: ["villages"], queryFn: () => api.get("/villages") });
  const villages = villagesQ.data?.villages ?? [];

  const reverse = useCallback((lat: number, lng: number) => {
    setResolving(true);
    if (revTimer.current) clearTimeout(revTimer.current);
    revTimer.current = setTimeout(async () => {
      try { const r = await api.get(`/maps/reverse?lat=${lat}&lng=${lng}`); setAddress(r.address); }
      catch { setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`); }
      finally { setResolving(false); }
    }, 550);
  }, []);

  const onCenterChanged = (lat: number, lng: number) => { setCenter({ lat, lng }); if (step !== "form") reverse(lat, lng); };
  const recenter = (lat: number, lng: number, addr?: string) => { setCenter({ lat, lng }); setMapKey((k) => k + 1); if (addr) setAddress(addr); else reverse(lat, lng); };

  useEffect(() => {
    reverse(INDIA_CENTER.lat, INDIA_CENTER.lng);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const useMyLoc = async () => {
    try { const l = await getCurrentLocation(); recenter(l.lat, l.lng); toast.show("Location found", "success"); }
    catch (e: any) { toast.show(e?.message ?? "Location error", "error"); }
  };

  const confirm = async () => {
    const picked: Picked = { ...center, address };
    if (step === "origin") { setOrigin(picked); setStep("dest"); setAddress("Move the map to set destination"); return; }
    if (step === "dest") {
      setDest(picked); setStep("form");
      try {
        const r = await api.post("/maps/route", { origin_lat: origin!.lat, origin_lng: origin!.lng, dest_lat: picked.lat, dest_lng: picked.lng });
        setRoute(r);
      } catch { toast.show("Could not calculate route", "error"); }
    }
  };

  const publishM = useMutation({
    mutationFn: () => {
      const h = DEPART.find((d) => d.key === depart)?.h ?? 0;
      const start = new Date(Date.now() + h * 3600 * 1000);
      const end = new Date(start.getTime() + 2 * 3600 * 1000);
      return api.post("/rides", {
        origin, dest,
        distance_km: route.distance_km, duration_min: route.duration_min, route_geometry: route.geometry,
        depart_start: start.toISOString(), depart_end: end.toISOString(),
        seats_total: seats, women_only: womenOnly, recurring, is_return: true,
      });
    },
    onSuccess: () => { toast.show("Ride published! Passengers can now find you.", "success"); router.replace("/(tabs)"); },
    onError: (e: any) => toast.show(e?.message ?? "Could not publish", "error"),
  });

  const isForm = step === "form";

  return (
    <View style={s.container}>
      <RouteMap
        key={mapKey}
        initialCenter={center}
        showCenterPin={!isForm}
        centerPinColor={step === "dest" ? "drop" : "pickup"}
        onCenterChanged={onCenterChanged}
        origin={isForm ? origin : null}
        destination={isForm ? dest : null}
        routeGeometry={route?.geometry}
        fitToRoute={isForm}
        interactive
      />

      <View style={[s.topBar, { top: insets.top + spacing.sm }]}>
        <PressableScale testID="publish-back" onPress={() => router.back()} style={s.iconBtn}>
          <Icon name="arrow-left" size={24} color={colors.onSurface} />
        </PressableScale>
        <View style={s.titlePill}><Text style={s.titlePillText}>{isForm ? "Ride details" : step === "origin" ? "Set your start" : "Set your destination"}</Text></View>
      </View>

      <View style={[s.panel, { paddingBottom: insets.bottom + spacing.lg }]}>
        {!isForm ? (
          <>
            <View style={s.addressBox}>
              {resolving ? <ActivityIndicator size="small" color={colors.brandPrimary} /> : <Icon name="map-marker" size={20} color={step === "dest" ? colors.error : colors.success} />}
              <Text style={s.addressText} numberOfLines={2} testID="publish-address">{address}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
              <Chip label="My location" icon="crosshairs-gps" onPress={useMyLoc} testID="publish-my-location" />
              {villages.map((v: any) => (
                <Chip key={v.id} label={v.name} icon="map-marker-outline" onPress={() => recenter(v.lat, v.lng, v.address)} />
              ))}
            </ScrollView>
            <Button testID={step === "origin" ? "confirm-origin" : "confirm-dest"} title={step === "origin" ? "Confirm start" : "Confirm destination"} icon="check-bold" onPress={confirm} disabled={resolving} />
          </>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }}>
            {route ? (
              <View style={s.metrics}>
                <Text style={s.metricText}>{route.distance_km} km</Text>
                <Text style={s.dotSep}>·</Text>
                <Text style={s.metricText}>{Math.round(route.duration_min)} min drive</Text>
              </View>
            ) : null}

            <Text style={s.label}>Departure</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
              {DEPART.map((d) => (
                <Chip key={d.key} testID={`depart-${d.key}`} label={d.label} active={depart === d.key} onPress={() => setDepart(d.key)} />
              ))}
            </ScrollView>

            <Text style={s.label}>Available seats</Text>
            <View style={s.stepper}>
              <PressableScale testID="seats-minus" onPress={() => setSeats((v) => Math.max(1, v - 1))} style={s.stepBtn}><Icon name="minus" size={22} color={colors.onSurface} /></PressableScale>
              <Text style={s.stepValue}>{seats}</Text>
              <PressableScale testID="seats-plus" onPress={() => setSeats((v) => Math.min(6, v + 1))} style={s.stepBtn}><Icon name="plus" size={22} color={colors.onSurface} /></PressableScale>
            </View>

            <View style={s.switchRow}>
              <View><Text style={s.switchLabel}>Women-only ride</Text><Text style={s.switchHint}>Only female passengers can book</Text></View>
              <Switch testID="women-only-switch" value={womenOnly} onValueChange={setWomenOnly} trackColor={{ true: colors.brandPrimary }} />
            </View>
            <View style={s.switchRow}>
              <View><Text style={s.switchLabel}>Recurring daily</Text><Text style={s.switchHint}>Repeat this trip every day</Text></View>
              <Switch testID="recurring-switch" value={recurring} onValueChange={setRecurring} trackColor={{ true: colors.brandPrimary }} />
            </View>

            <Button testID="publish-submit" title="Publish ride" icon="send" onPress={() => publishM.mutate()} loading={publishM.isPending} disabled={!route} />
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  topBar: { position: "absolute", left: spacing.lg, right: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.sm, zIndex: 20 },
  iconBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", ...shadow.md },
  titlePill: { flex: 1, backgroundColor: c.surface, borderRadius: radius.pill, height: 46, justifyContent: "center", paddingHorizontal: spacing.lg, ...shadow.md },
  titlePillText: { fontSize: 16, fontWeight: "800", color: c.onSurface },
  panel: { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "62%", backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, gap: spacing.md, ...shadow.lg },
  addressBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, minHeight: 56 },
  addressText: { flex: 1, color: c.onSurface, fontSize: 15, fontWeight: "600" },
  chipRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  metrics: { flexDirection: "row", alignItems: "center", gap: spacing.sm, justifyContent: "center" },
  metricText: { color: c.onSurface, fontSize: 16, fontWeight: "800" },
  dotSep: { color: c.muted, fontSize: 16 },
  label: { color: c.onSurface, fontSize: 15, fontWeight: "800", marginTop: spacing.xs },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.sm },
  stepBtn: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", ...shadow.sm },
  stepValue: { color: c.onSurface, fontSize: 24, fontWeight: "900" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md },
  switchLabel: { color: c.onSurface, fontSize: 15, fontWeight: "800" },
  switchHint: { color: c.muted, fontSize: 13 },
}));
