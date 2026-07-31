/**
 * Silieco four-square mark. 1:1 vector copy of the web favicon —
 * keep this file and the SVG in sync.
 *
 * react-native-svg does not resolve CSS `currentColor`, so callers must pass
 * `color` explicitly. For theme-aware usage, pair with `useColorScheme` +
 * `THEME` token from `@/lib/theme`.
 */
import Svg, { Path, Rect } from "react-native-svg";

interface SiliecoLogoProps {
  size?: number;
  color?: string;
}

export function SiliecoLogo({ size = 48, color }: SiliecoLogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Rect width="64" height="64" rx="14" fill={color ?? "#0b0d12"} />
      <Path
        d="M18 18h12v12H18zM34 18h12v12H34zM18 34h12v12H18zM34 34h12v12H34z"
        fill="#f3f6fb"
      />
      <Path
        d="M34 18h12v12H34zM18 34h12v12H18z"
        fill="#3978f6"
      />
    </Svg>
  );
}
