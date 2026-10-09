import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, UrlTile, type Region } from "react-native-maps";

import { Icon } from "@/src/components/icon";
import { INDIA_CENTER, type RouteMapProps } from "@/src/components/route-map-types";

export function RouteMap({
  origin,
  destination,
  driverLocation,
  userLocation,
  routeGeometry = [],
  showCenterPin,
  centerPinColor = "pickup",
  onCenterChanged,
  fitToRoute,
  interactive = true,
  initialCenter,
  style,
}: RouteMapProps) {
  const mapRef = useRef<MapView>(null);
  const start = initialCenter ?? origin ?? INDIA_CENTER;
  const initialRegion: Region = {
    latitude: start.lat,
    longitude: start.lng,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  };

  useEffect(() => {
    if (fitToRoute && routeGeometry.length > 1 && mapRef.current) {
      const coords = routeGeometry.map((p) => ({ latitude: p[0], longitude: p[1] }));
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 80, right: 60, bottom: 220, left: 60 },
        animated: true,
      });
    }
  }, [fitToRoute, routeGeometry]);

  useEffect(() => {
    if (driverLocation && mapRef.current && !fitToRoute) {
      mapRef.current.animateCamera({ center: { latitude: driverLocation.lat, longitude: driverLocation.lng } });
    }
  }, [driverLocation, fitToRoute]);

  const polyCoords = routeGeometry.map((p) => ({ latitude: p[0], longitude: p[1] }));

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        showsUserLocation={false}
        onRegionChangeComplete={(r) => {
          if (showCenterPin && onCenterChanged) onCenterChanged(r.latitude, r.longitude);
        }}
      >
        <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} flipY={false} />

        {polyCoords.length > 1 ? (
          <Polyline coordinates={polyCoords} strokeColor="#C56A3C" strokeWidth={5} />
        ) : null}

        {origin ? (
          <Marker coordinate={{ latitude: origin.lat, longitude: origin.lng }} anchor={{ x: 0.5, y: 0.9 }}>
            <MarkerDot color="#4A7C59" icon="map-marker" />
          </Marker>
        ) : null}
        {destination ? (
          <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} anchor={{ x: 0.5, y: 0.9 }}>
            <MarkerDot color="#B33939" icon="flag-variant" />
          </Marker>
        ) : null}
        {driverLocation ? (
          <Marker
            coordinate={{ latitude: driverLocation.lat, longitude: driverLocation.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            rotation={driverLocation.heading ?? 0}
            flat
          >
            <MarkerDot color="#2C1E16" icon="car" />
          </Marker>
        ) : null}
        {userLocation ? (
          <Marker coordinate={{ latitude: userLocation.lat, longitude: userLocation.lng }} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.userDot} />
          </Marker>
        ) : null}
      </MapView>

      {showCenterPin ? (
        <View pointerEvents="none" style={styles.centerPin}>
          <Icon name="map-marker" size={44} color={centerPinColor === "pickup" ? "#4A7C59" : "#B33939"} />
        </View>
      ) : null}
    </View>
  );
}

function MarkerDot({ color, icon }: { color: string; icon: any }) {
  return (
    <View style={[styles.marker, { backgroundColor: color }]}>
      <Icon name={icon} size={18} color="#FFFFFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden" },
  marker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  userDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#1D4ED8",
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  centerPin: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginLeft: -22,
    marginTop: -44,
  },
});
