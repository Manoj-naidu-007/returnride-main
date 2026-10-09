import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/api";
import { Icon } from "@/src/components/icon";
import { RouteMap } from "@/src/components/RouteMap";
import { INDIA_CENTER, type LatLng } from "@/src/components/route-map-types";
import { useToast } from "@/src/components/toast";
import { Button, Chip, PressableScale } from "@/src/components/ui";
import { getCurrentLocation } from "@/src/hooks/use-current-location";
import { makeStyles, radius, shadow, spacing, useTheme } from "@/src/theme";

type Picked = LatLng & { address: string };
type Step = "pickup" | "drop" | "review";

export default function LocationPicker() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>("pickup");
  const [center, setCenter] = useState<LatLng>(INDIA_CENTER);
  const [address, setAddress] = useState("Move the map to set your point");
  const [resolving, setResolving] = useState(false);
  const [mapKey, setMapKey] = useState(0);

  const [pickup, setPickup] = useState<Picked | null>(null);
  const [drop, setDrop] = useState<Picked | null>(null);

  const [route, setRoute] = useState<{ geometry: number[][]; distance_km: number; duration_min: number } | null>(null);
  const [fare, setFare] = useState<number | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const revTimer = useRef<any>(null);
  const searchTimer = useRef<any>(null);

  const villagesQ = useQuery({ queryKey: ["villages"], queryFn: () => api.get("/villages") });
  const villages = villagesQ.data?.villages ?? [];

  const reverseGeocode = useCallback((lat: number, lng: number) => {
    setResolving(true);
    if (revTimer.current) clearTimeout(revTimer.current);
    revTimer.current = setTimeout(async () => {
      try {
        const r = await api.get(`/maps/reverse?lat=${lat}&lng=${lng}`);
        setAddress(r.address);
      } catch {
        setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      } finally {
        setResolving(false);
      }
    }, 550);
  }, []);

  const onCenterChanged = (lat: number, lng: number) => {
    setCenter({ lat, lng });
    if (step !== "review") reverseGeocode(lat, lng);
  };

  useEffect(() => {
    reverseGeocode(INDIA_CENTER.lat, INDIA_CENTER.lng);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearch = (q: string) => {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const r = await api.get(`/maps/search?q=${encodeURIComponent(q)}`);
        setSuggestions(r.results ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 500);
  };

  const recenter = (lat: number, lng: number, addr?: string) => {
    setCenter({ lat, lng });
    setMapKey((k) => k + 1);
    setSuggestions([]);
    setQuery("");
    if (addr) setAddress(addr);
    else reverseGeocode(lat, lng);
  };

  const useMyLocation = async () => {
    try {
      const loc = await getCurrentLocation();
      recenter(loc.lat, loc.lng);
      toast.show("Location found", "success");
    } catch (e: any) {
      toast.show(e?.message ?? "Could not get location", "error");
    }
  };

  const confirmPoint = async () => {
    const picked: Picked = { ...center, address };
    if (step === "pickup") {
      setPickup(picked);
      setStep("drop");
      setAddress("Move the map to set your drop");
      return;
    }
    if (step === "drop") {
      setDrop(picked);
      setStep("review");
      setLoadingRoute(true);
      try {
        const r = await api.post("/maps/route", {
          origin_lat: pickup!.lat, origin_lng: pickup!.lng, dest_lat: picked.lat, dest_lng: picked.lng,
        });
        setRoute(r);
        const q = await api.get(`/fare/quote?distance_km=${r.distance_km}&is_return=true`);
        setFare(q.total);
      } catch {
        toast.show("Could not calculate route", "error");
      } finally {
        setLoadingRoute(false);
      }
    }
  };

  const findRides = () => {
    if (!pickup || !drop || !route) return;
    router.replace({
      pathname: "/matches",
      params: {
        pickup: JSON.stringify(pickup),
        drop: JSON.stringify(drop),
        distance_km: String(route.distance_km),
        duration_min: String(route.duration_min),
      },
    });
  };

  const isReview = step === "review";

  return (
    <View style={s.container}>
      <RouteMap
        key={mapKey}
        initialCenter={center}
        showCenterPin={!isReview}
        centerPinColor={step === "drop" ? "drop" : "pickup"}
        onCenterChanged={onCenterChanged}
        origin={isReview ? pickup : null}
        destination={isReview ? drop : null}
        routeGeometry={route?.geometry}
        fitToRoute={isReview}
        interactive
      />

      {/* Top bar */}
      <View style={[s.topBar, { top: insets.top + spacing.sm }]}>
        <PressableScale testID="picker-back" onPress={() => router.back()} style={s.iconBtn}>
          <Icon name="arrow-left" size={24} color={colors.onSurface} />
        </PressableScale>
        {!isReview ? (
          <View style={s.searchWrap}>
            <Icon name="magnify" size={20} color={colors.muted} />
            <TextInput
              testID="picker-search-input"
              placeholder={`Search ${step} location`}
              placeholderTextColor={colors.muted}
              style={s.searchInput}
              value={query}
              onChangeText={onSearch}
            />
          </View>
        ) : (
          <View style={s.reviewTitle}><Text style={s.reviewTitleText}>Confirm your ride</Text></View>
        )}
      </View>

      {suggestions.length > 0 && !isReview ? (
        <View style={[s.suggestions, { top: insets.top + 64 }]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            {suggestions.map((sg, i) => (
              <Pressable key={i} testID={`suggestion-${i}`} style={s.suggestion} onPress={() => recenter(sg.lat, sg.lng, sg.address)}>
                <Icon name="map-marker-outline" size={18} color={colors.brandPrimary} />
                <Text style={s.suggestionText} numberOfLines={2}>{sg.address}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Bottom panel */}
      <View style={[s.panel, { paddingBottom: insets.bottom + spacing.lg }]}>
        {isReview ? (
          <ReviewPanel pickup={pickup!} drop={drop!} route={route} fare={fare} loading={loadingRoute} onFind={findRides} onEdit={() => { setStep("pickup"); setRoute(null); setFare(null); setAddress("Move the map to set your point"); }} />
        ) : (
          <>
            <View style={s.stepRow}>
              <View style={[s.stepDot, { backgroundColor: step === "drop" ? colors.error : colors.success }]} />
              <Text style={s.stepLabel}>{step === "pickup" ? "Set pickup point" : "Set drop point"}</Text>
            </View>
            <View style={s.addressBox}>
              {resolving ? <ActivityIndicator size="small" color={colors.brandPrimary} /> : <Icon name="map-marker" size={20} color={step === "drop" ? colors.error : colors.success} />}
              <Text style={s.addressText} numberOfLines={2} testID="picker-address">{address}</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
              <Chip label="My location" icon="crosshairs-gps" onPress={useMyLocation} testID="use-my-location" />
              {villages.map((v: any) => (
                <Chip key={v.id} testID={`landmark-${v.id}`} label={v.name} icon={v.type === "temple" ? "temple-hindu" : v.type === "market" ? "storefront" : "bus-stop"} onPress={() => recenter(v.lat, v.lng, v.address)} />
              ))}
            </ScrollView>

            <Button
              testID={step === "pickup" ? "confirm-pickup-button" : "confirm-drop-button"}
              title={step === "pickup" ? "Confirm pickup" : "Confirm drop"}
              icon="check-bold"
              onPress={confirmPoint}
              disabled={resolving}
            />
          </>
        )}
      </View>
    </View>
  );
}

function ReviewPanel({ pickup, drop, route, fare, loading, onFind, onEdit }: any) {
  const s = useStyles();
  const { colors } = useTheme();
  if (loading || !route) {
    return (
      <View style={{ paddingVertical: spacing.xl, alignItems: "center", gap: spacing.md }}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
        <Text style={s.addressText}>Calculating best route…</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: spacing.md }}>
      <View style={s.routeLine}>
        <View style={{ alignItems: "center" }}>
          <View style={[s.dot, { backgroundColor: colors.success }]} />
          <View style={s.line} />
          <Icon name="map-marker" size={16} color={colors.error} />
        </View>
        <View style={{ flex: 1, gap: spacing.md }}>
          <Text style={s.addressSmall} numberOfLines={1}>{pickup.address}</Text>
          <Text style={s.addressSmall} numberOfLines={1}>{drop.address}</Text>
        </View>
      </View>

      <View style={s.metrics}>
        <Metric icon="map-marker-distance" value={`${route.distance_km} km`} label="Distance" />
        <Metric icon="clock-outline" value={`${Math.round(route.duration_min)} min`} label="ETA" />
        <Metric icon="cash" value={fare != null ? `₹${fare}` : "—"} label="Est. fare" highlight />
      </View>

      <View style={s.reviewActions}>
        <View style={{ flex: 1 }}>
          <Button testID="edit-points-button" title="Edit" variant="outline" icon="pencil" onPress={onEdit} />
        </View>
        <View style={{ flex: 2 }}>
          <Button testID="find-rides-button" title="Find rides" icon="magnify" onPress={onFind} />
        </View>
      </View>
    </View>
  );
}

function Metric({ icon, value, label, highlight }: any) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[s.metric, highlight && s.metricHighlight]}>
      <Icon name={icon} size={20} color={highlight ? colors.brandPrimary : colors.onSurfaceTertiary} />
      <Text style={[s.metricValue, highlight && { color: colors.brandPrimary }]}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  topBar: { position: "absolute", left: spacing.lg, right: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.sm, zIndex: 20 },
  iconBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", ...shadow.md },
  searchWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.surface, borderRadius: radius.pill, paddingHorizontal: spacing.lg, height: 46, ...shadow.md },
  searchInput: { flex: 1, fontSize: 15, color: c.onSurface, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}) },
  reviewTitle: { flex: 1, backgroundColor: c.surface, borderRadius: radius.pill, height: 46, justifyContent: "center", paddingHorizontal: spacing.lg, ...shadow.md },
  reviewTitleText: { fontSize: 16, fontWeight: "800", color: c.onSurface },
  suggestions: { position: "absolute", left: spacing.lg + 54, right: spacing.lg, maxHeight: 260, backgroundColor: c.surface, borderRadius: radius.md, ...shadow.lg, zIndex: 30, overflow: "hidden" },
  suggestion: { flexDirection: "row", gap: spacing.sm, alignItems: "center", padding: spacing.md, borderBottomWidth: 1, borderBottomColor: c.divider },
  suggestionText: { flex: 1, color: c.onSurface, fontSize: 14 },
  panel: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, gap: spacing.md, ...shadow.lg },
  stepRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepDot: { width: 12, height: 12, borderRadius: 6 },
  stepLabel: { color: c.onSurface, fontSize: 18, fontWeight: "900" },
  addressBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, minHeight: 56 },
  addressText: { flex: 1, color: c.onSurface, fontSize: 15, fontWeight: "600" },
  chipRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  routeLine: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  dot: { width: 14, height: 14, borderRadius: 7 },
  line: { width: 2, height: 24, backgroundColor: c.border, marginVertical: 2 },
  addressSmall: { color: c.onSurface, fontSize: 14, fontWeight: "600" },
  metrics: { flexDirection: "row", gap: spacing.sm },
  metric: { flex: 1, alignItems: "center", gap: 4, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, paddingVertical: spacing.md },
  metricHighlight: { backgroundColor: c.brandTertiary },
  metricValue: { color: c.onSurface, fontSize: 17, fontWeight: "900" },
  metricLabel: { color: c.muted, fontSize: 12, fontWeight: "600" },
  reviewActions: { flexDirection: "row", gap: spacing.md },
}));
