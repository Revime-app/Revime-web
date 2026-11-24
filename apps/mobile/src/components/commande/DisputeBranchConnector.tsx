import Svg, { Path, Circle } from 'react-native-svg';

type Props = {
  color: string;
  width?: number;
  height?: number;
};

export function DisputeBranchConnector({ color, width = 36, height = 30 }: Props) {
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Circle cx={4} cy={4} r={3} fill="none" stroke={color} strokeWidth={1.5} />
      <Path
        d={`M 7,4 C 20,4 20,${height} ${width},${height}`}
        fill="none"
        stroke={color}
        strokeWidth={2}
      />
    </Svg>
  );
}
