import L from "leaflet";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";

import { Icon } from "@/src/components/icon";
import { INDIA_CENTER, type LatLng, type RouteMapProps } from "@/src/components/route-map-types";

let cssInjected = false;
function injectLeafletCss() {
  if (cssInjected || typeof document === "undefined") return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  document.head.appendChild(link);
  cssInjected = true;
}

function pinIcon(color: string, glyph: string) {
  return L.divIcon({
    className: "rr-marker",
    html: `<div style="width:30px;height:30px;border-radius:50%;background:${color};border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.3);font-size:15px;">${glyph}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  });
}

const originIcon = () => pinIcon("#4A7C59", "📍");
const destIcon = () => pinIcon("#B33939", "🏁");
const driverIcon = () => pinIcon("#2C1E16", "🚗");
const userIcon = () =>
  L.divIcon({
    className: "rr-user",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:#1D4ED8;border:3px solid #fff;box-shadow:0 0 0 4px rgba(29,78,216,.25);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

function MapController({ routeGeometry, fitToRoute, driverLocation, showCenterPin, onCenterChanged }: RouteMapProps) {
  const map = useMap();

  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 60);
  }, [map]);

  useEffect(() => {
    if (fitToRoute && routeGeometry && routeGeometry.length > 1) {
      map.fitBounds(routeGeometry as any, { padding: [50, 50] });
    }
  }, [fitToRoute, routeGeometry, map]);

  useEffect(() => {
    if (driverLocation && !fitToRoute) {
      map.panTo([driverLocation.lat, driverLocation.lng]);
    }
  }, [driverLocation, fitToRoute, map]);

  useMapEvents({
    moveend: () => {
      if (showCenterPin && onCenterChanged) {
        const c = map.getCenter();
        onCenterChanged(c.lat, c.lng);
      }
    },
  });

  return null;
}

export function RouteMap(props: RouteMapProps) {
  const {
    origin,
    destination,
    driverLocation,
    userLocation,
    routeGeometry = [],
    showCenterPin,
    centerPinColor = "pickup",
    interactive = true,
    initialCenter,
    style,
  } = props;

  injectLeafletCss();
  const start: LatLng = initialCenter ?? origin ?? INDIA_CENTER;

  return (
    <View style={[styles.container, style]}>
      <MapContainer
        center={[start.lat, start.lng]}
        zoom={12}
        style={{ height: "100%", width: "100%" }}
        zoomControl={interactive}
        dragging={interactive}
        scrollWheelZoom={interactive}
        attributionControl={false}
      >
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
        {routeGeometry.length > 1 ? (
          <Polyline positions={routeGeometry as any} pathOptions={{ color: "#C56A3C", weight: 5 }} />
        ) : null}
        {origin ? <Marker position={[origin.lat, origin.lng]} icon={originIcon()} /> : null}
        {destination ? <Marker position={[destination.lat, destination.lng]} icon={destIcon()} /> : null}
        {driverLocation ? <Marker position={[driverLocation.lat, driverLocation.lng]} icon={driverIcon()} /> : null}
        {userLocation ? <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon()} /> : null}
        <MapController {...props} />
      </MapContainer>

      {showCenterPin ? (
        <View pointerEvents="none" style={styles.centerPin}>
          <Icon name="map-marker" size={44} color={centerPinColor === "pickup" ? "#4A7C59" : "#B33939"} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden" },
  centerPin: { position: "absolute", top: "50%", left: "50%", marginLeft: -22, marginTop: -44, zIndex: 500 },
});
