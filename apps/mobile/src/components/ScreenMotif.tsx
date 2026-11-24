import { View, StyleSheet } from 'react-native';
import Svg, { Path, Ellipse } from 'react-native-svg';
import { useTheme } from '../theme';

type Blob = {
  w: number;
  h: number;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  topPct?: string;
};

type Arc = {
  size: number;
  sweep: number;
  rotate: number;
  opacity: number;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  topPct?: string;
};

const COMPOSITIONS: { blob: Blob; blob2?: Blob; arc?: Arc }[] = [
  {
    blob: { w: 200, h: 200, top: -60, right: -50 },
    arc: { size: 150, sweep: 210, rotate: 20, opacity: 0.28, bottom: 90, left: -40 },
  },
  {
    blob: { w: 180, h: 180, bottom: -50, left: -46 },
    arc: { size: 140, sweep: 240, rotate: -30, opacity: 0.26, top: 70, right: -36 },
  },
  {
    blob: { w: 150, h: 150, top: -44, left: -40 },
    arc: { size: 130, sweep: 200, rotate: 60, opacity: 0.24, topPct: '45%', right: -48 },
  },
  {
    blob: { w: 190, h: 190, bottom: -56, right: -48 },
    arc: { size: 150, sweep: 230, rotate: -10, opacity: 0.26, top: -30, left: -34 },
  },
  {
    blob: { w: 130, h: 130, top: -40, left: -36 },
    blob2: { w: 120, h: 120, bottom: -38, right: -40 },
  },
  {
    blob: { w: 170, h: 170, topPct: '40%', left: -60 },
    arc: { size: 140, sweep: 220, rotate: 140, opacity: 0.26, bottom: 60, right: -40 },
  },
];

const STROKE = 2.5;

/**
 * EXPORTED for `app/reparateurs-verifies.tsx`, whose prototype counterpart draws an
 * explicit dotted orbit around the shield (`Verification.tsx:30`) rather than relying on
 * the ambient background motif. Exported instead of copied: the arc maths here is the
 * only implementation, and a second one would drift from it.
 *
 * `Arc`'s positioning fields are optional, so a caller placing it manually just omits
 * them and positions the element itself.
 */
export function DottedArc({
  size,
  sweep,
  rotate,
  opacity,
  color,
}: Arc & { color: string }) {
  const r = 50 - STROKE;
  const start = -90;
  const end = start + sweep;

  // Convert degrees to radians
  const rad = (deg: number) => (deg * Math.PI) / 180;

  // Calculate start and end points
  const x1 = 50 + r * Math.cos(rad(start));
  const y1 = 50 + r * Math.sin(rad(start));
  const x2 = 50 + r * Math.cos(rad(end));
  const y2 = 50 + r * Math.sin(rad(end));

  // Large arc flag: 1 if sweep > 180°, else 0
  const largeArc = sweep > 180 ? 1 : 0;

  // Build the elliptical arc path
  const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{ transform: [{ rotate: `${rotate}deg` }] }}
    >
      <Path
        d={d}
        stroke={color}
        strokeOpacity={opacity}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray="0.1 9"
        fill="none"
      />
    </Svg>
  );
}

function renderBlob(b: Blob, soft: string, key: string) {
  const positionStyle: any = {
    position: 'absolute',
    width: b.w,
    height: b.h,
    opacity: 0.5,
  };

  if (b.top !== undefined) positionStyle.top = b.top;
  if (b.topPct !== undefined) positionStyle.top = b.topPct;
  if (b.bottom !== undefined) positionStyle.bottom = b.bottom;
  if (b.left !== undefined) positionStyle.left = b.left;
  if (b.right !== undefined) positionStyle.right = b.right;

  return (
    <View key={key} style={positionStyle} pointerEvents="none">
      <Svg width={b.w} height={b.h} viewBox="0 0 100 100">
        {/* Approximates the prototype's organic border-radius: 46% 54% 58% 42% / 52% 44% 56% 48% */}
        <Ellipse cx={50} cy={50} rx={48} ry={44} fill={soft} />
      </Svg>
    </View>
  );
}

export function ScreenMotif({
  v = 0,
  variant = 'accent',
}: {
  v?: number;
  variant?: 'accent' | 'navy';
}) {
  const { accent, palette } = useTheme();

  // Wrap v safely for any integer, including negatives
  const c = COMPOSITIONS[((v % COMPOSITIONS.length) + COMPOSITIONS.length) % COMPOSITIONS.length]!;

  // Pick colours from theme: navy family or themed accent
  const soft = variant === 'navy' ? palette.navySoft : accent.accentSoft;
  const line = variant === 'navy' ? palette.navy : accent.accent;

  const placeArc = (arc: Arc) => {
    const style: any = { position: 'absolute' };
    if (arc.top !== undefined) style.top = arc.top;
    if (arc.topPct !== undefined) style.top = arc.topPct;
    if (arc.bottom !== undefined) style.bottom = arc.bottom;
    if (arc.left !== undefined) style.left = arc.left;
    if (arc.right !== undefined) style.right = arc.right;
    return style;
  };

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {renderBlob(c.blob, soft, 'b1')}
      {c.blob2 && renderBlob(c.blob2, soft, 'b2')}
      {c.arc && (
        <View style={placeArc(c.arc)} pointerEvents="none">
          <DottedArc {...c.arc} color={line} />
        </View>
      )}
    </View>
  );
}
