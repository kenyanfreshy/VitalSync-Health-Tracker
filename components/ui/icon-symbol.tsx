// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";
import { ICON_MAPPING, FALLBACK_ICON } from "./icon-mapping";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * SF Symbol → Material Icon mapping.
 * All entries are maintained in `icon-mapping.ts` (plain TS, no JSX) so they
 * can be imported by both this component and the vitest CI lint test.
 */
const MAPPING = ICON_MAPPING as unknown as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 *
 * If a name is not found in MAPPING, a `help-outline` fallback is rendered and a warning
 * is logged to the console — this prevents native invariant crashes from undefined icon names.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  const resolved = ICON_MAPPING[name as string] as ComponentProps<typeof MaterialIcons>["name"] | undefined;

  // Guard 1: no mapping entry at all
  if (!resolved) {
    if (__DEV__) {
      console.warn(
        `[IconSymbol] No Material Icon mapping found for SF Symbol "${name}". ` +
        `Add it to ICON_MAPPING in components/ui/icon-mapping.ts. ` +
        `Rendering fallback "${FALLBACK_ICON}" icon.`
      );
    }
    return <MaterialIcons color={color} size={size} name={FALLBACK_ICON} style={style} />;
  }

  // Guard 2: mapping entry exists but glyph name is not in MaterialIcons (would crash on native)
  const glyphMap = (MaterialIcons as unknown as { glyphMap?: Record<string, unknown> }).glyphMap;
  if (glyphMap && !(resolved in glyphMap)) {
    if (__DEV__) {
      console.warn(
        `[IconSymbol] Material Icon "${resolved}" (mapped from "${name}") does not exist ` +
        `in MaterialIcons.glyphMap. Update ICON_MAPPING. Rendering fallback "${FALLBACK_ICON}" icon.`
      );
    }
    return <MaterialIcons color={color} size={size} name={FALLBACK_ICON} style={style} />;
  }

  return <MaterialIcons color={color} size={size} name={resolved} style={style} />;
}

// Re-export MAPPING for backward compatibility
export { MAPPING };
