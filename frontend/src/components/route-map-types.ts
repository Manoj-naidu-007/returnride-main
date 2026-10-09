export type LatLng = { lat: number; lng: number };

export type RouteMapProps = {
  origin?: LatLng | null;
  destination?: LatLng | null;
  driverLocation?: (LatLng & { heading?: number }) | null;
  userLocation?: LatLng | null;
  routeGeometry?: number[][]; // list of [lat, lng]
  showCenterPin?: boolean;
  centerPinColor?: "pickup" | "drop";
  onCenterChanged?: (lat: number, lng: number) => void;
  fitToRoute?: boolean;
  interactive?: boolean;
  initialCenter?: LatLng;
  style?: any;
};

export const INDIA_CENTER: LatLng = { lat: 18.0876, lng: 74.0256 };
