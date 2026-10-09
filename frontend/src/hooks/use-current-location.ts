import { Platform } from "react-native";

export type Coords = { lat: number; lng: number };

export async function getCurrentLocation(): Promise<Coords> {
  if (Platform.OS === "web") {
    return new Promise((resolve, reject) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        reject(new Error("Location not supported on this browser"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => reject(new Error("Location permission denied")),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });
  }

  const Location = await import("expo-location");
  const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    const err: any = new Error("Location permission denied");
    err.canAskAgain = canAskAgain;
    throw err;
  }
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}
