import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Modal, ScrollView, Text, View } from "react-native";

import { api } from "@/src/api";
import { Icon } from "@/src/components/icon";
import { useToast } from "@/src/components/toast";
import { Badge, Button, PressableScale, TextField } from "@/src/components/ui";
import { makeStyles, radius, shadow, spacing, useTheme } from "@/src/theme";

export function AdminUserModal({ user, onClose }: { user: any; onClose: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [newPass, setNewPass] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "users"] });
    qc.invalidateQueries({ queryKey: ["admin", "drivers"] });
    qc.invalidateQueries({ queryKey: ["admin", "stats"] });
  };

  const patch = useMutation({
    mutationFn: (body: any) => api.patch(`/admin/users/${user.id}`, body),
    onSuccess: () => { toast.show("User updated", "success"); invalidate(); onClose(); },
    onError: (e: any) => toast.show(e?.message ?? "Failed", "error"),
  });
  const del = useMutation({
    mutationFn: () => api.del(`/admin/users/${user.id}`),
    onSuccess: () => { toast.show("User removed", "info"); invalidate(); onClose(); },
    onError: (e: any) => toast.show(e?.message ?? "Failed", "error"),
  });

  const blocked = user.status === "blocked";
  const isDriver = user.role === "driver";

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.bg}>
        <View style={s.card}>
          <ScrollView contentContainerStyle={{ gap: spacing.md }} showsVerticalScrollIndicator={false}>
            <View style={s.header}>
              <View style={s.avatar}><Icon name="account" size={26} color="#FFFFFF" /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{user.name}</Text>
                <Text style={s.muted}>+91 {user.phone}</Text>
              </View>
              <PressableScale testID="modal-close" onPress={onClose} style={s.closeBtn}><Icon name="close" size={22} color={colors.onSurface} /></PressableScale>
            </View>

            <View style={s.badgeRow}>
              <Badge label={user.role} tone="brand" />
              <Badge label={user.status ?? "active"} tone={blocked ? "error" : "success"} />
              {user.verified ? <Badge label="Verified" tone="success" /> : null}
            </View>

            <View style={s.statRow}>
              <View style={s.stat}><Text style={s.statValue}>⭐ {Number(user.rating ?? 5).toFixed(1)}</Text><Text style={s.statLabel}>Rating</Text></View>
              <View style={s.stat}><Text style={s.statValue}>{user.completed_rides ?? 0}</Text><Text style={s.statLabel}>Completed</Text></View>
              <View style={s.stat}><Text style={s.statValue}>{user.cancelled_rides ?? 0}</Text><Text style={s.statLabel}>Cancelled</Text></View>
            </View>

            {isDriver ? (
              <View style={s.info}>
                <Text style={s.infoRow}>🚗 {user.vehicle_model ?? "—"} · {user.vehicle_number ?? "—"}</Text>
                <Text style={s.infoRow}>🪪 Licence: {user.license_no ?? "—"}</Text>
                <Text style={s.infoRow}>📄 RC: {user.vehicle_rc_no ?? "—"}</Text>
              </View>
            ) : null}

            {!blocked ? (
              <>
                <TextField testID="block-reason" label="Block reason" placeholder="Reason for blocking" value={reason} onChangeText={setReason} icon="comment-alert" />
                <Button testID="block-user" title="Block user" variant="danger" icon="account-cancel" onPress={() => patch.mutate({ status: "blocked", blocked_reason: reason || "Blocked by admin" })} loading={patch.isPending} />
              </>
            ) : (
              <Button testID="unblock-user" title="Unblock user" icon="account-check" onPress={() => patch.mutate({ status: "active", blocked_reason: null })} loading={patch.isPending} />
            )}

            {isDriver ? (
              <Button testID="toggle-verify" title={user.verified ? "Remove verification" : "Verify driver"} variant="outline" icon="shield-check" onPress={() => patch.mutate({ verified: !user.verified })} loading={patch.isPending} />
            ) : null}

            <View style={s.roleRow}>
              {(["passenger", "driver", "admin"] as const).map((r) => (
                <PressableScale key={r} testID={`role-${r}`} onPress={() => patch.mutate({ role: r })} style={[s.roleChip, user.role === r && s.roleChipActive]}>
                  <Text style={[s.roleText, user.role === r && { color: colors.onBrandPrimary }]}>{r}</Text>
                </PressableScale>
              ))}
            </View>

            <TextField testID="reset-pass" label="Reset password" placeholder="New password" value={newPass} onChangeText={setNewPass} icon="lock-reset" />
            <Button testID="do-reset-pass" title="Reset password" variant="outline" icon="lock-reset" onPress={() => { if (newPass.length < 4) { toast.show("Min 4 chars", "error"); return; } patch.mutate({ reset_password: newPass }); }} loading={patch.isPending} />

            <Button testID="delete-user" title="Delete (soft)" variant="ghost" icon="delete" onPress={() => del.mutate()} loading={del.isPending} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  bg: { flex: 1, backgroundColor: "rgba(44,30,22,0.6)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  card: { width: "100%", maxWidth: 480, maxHeight: "88%", backgroundColor: c.surface, borderRadius: radius.lg, padding: spacing.xl, ...shadow.lg },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  name: { color: c.onSurface, fontSize: 20, fontWeight: "900" },
  muted: { color: c.muted, fontSize: 14 },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  badgeRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  statRow: { flexDirection: "row", backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { color: c.onSurface, fontSize: 18, fontWeight: "900" },
  statLabel: { color: c.muted, fontSize: 12 },
  info: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  infoRow: { color: c.onSurfaceSecondary, fontSize: 14 },
  roleRow: { flexDirection: "row", gap: spacing.sm },
  roleChip: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
  roleChipActive: { backgroundColor: c.brandPrimary },
  roleText: { color: c.onSurfaceTertiary, fontWeight: "800", textTransform: "capitalize" },
}));
