import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";

import { useTheme } from "@/src/theme";

type IconProps = {
  name: React.ComponentProps<typeof MaterialDesignIcons>["name"];
  size?: number;
  color?: string;
};

export function Icon({ name, size = 22, color }: IconProps) {
  const { colors } = useTheme();
  return <MaterialDesignIcons name={name} size={size} color={color ?? colors.onSurface} />;
}
