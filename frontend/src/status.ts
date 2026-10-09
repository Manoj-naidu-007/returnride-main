export type Tone = "brand" | "success" | "warning" | "error" | "muted";

export const STATUS_META: Record<string, { label: string; tone: Tone; icon: string }> = {
  requested: { label: "Requested", tone: "warning", icon: "clock-outline" },
  accepted: { label: "Accepted", tone: "brand", icon: "check" },
  en_route: { label: "On the way", tone: "brand", icon: "car" },
  arrived: { label: "Arrived", tone: "brand", icon: "map-marker-check" },
  in_progress: { label: "In progress", tone: "success", icon: "steering" },
  completed: { label: "Completed", tone: "success", icon: "flag-checkered" },
  cancelled: { label: "Cancelled", tone: "error", icon: "close-circle" },
  rejected: { label: "Declined", tone: "error", icon: "close-circle" },
};

export const ACTIVE_STATES = ["requested", "accepted", "en_route", "arrived", "in_progress"];
