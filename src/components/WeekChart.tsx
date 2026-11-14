import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import type { DaySummary } from '../types';
import { shortWeekday, toDateKey } from '../utils/nutrition';
import { colors, type } from '../theme';

/** 7-day calorie bars, with a dashed goal line and a solid weekly-average line. */
export function WeekChart({
  days,
  goal,
  average,
}: {
  days: DaySummary[];
  goal: number;
  average: number;
}) {
  const { width: screenW } = useWindowDimensions();
  const width = screenW - 64; // card padding
  const height = 150;
  const top = 12;
  const bottom = 22;
  const chartH = height - top - bottom;
  const max = Math.max(goal * 1.15, ...days.map(d => d.totals.calories), 1);
  const slot = width / days.length;
  const barW = Math.min(28, slot * 0.55);
  const y = (v: number) => top + chartH * (1 - v / max);
  const today = toDateKey();

  return (
    <View>
      <Svg width={width} height={height}>
        {days.map((d, i) => {
          const h = (d.totals.calories / max) * chartH;
          const x = i * slot + (slot - barW) / 2;
          const isToday = d.date === today;
          return (
            <React.Fragment key={d.date}>
              <Rect x={x} y={top} width={barW} height={chartH} rx={6} fill={colors.track} />
              {h > 0 && (
                <Rect
                  x={x}
                  y={top + chartH - h}
                  width={barW}
                  height={h}
                  rx={6}
                  fill={d.totals.calories > goal ? colors.carbs : colors.calories}
                  opacity={isToday ? 1 : 0.75}
                />
              )}
              <SvgText
                x={x + barW / 2}
                y={height - 6}
                fontSize={11}
                fontWeight={isToday ? '700' : '400'}
                fill={isToday ? colors.text : colors.textMuted}
                textAnchor="middle">
                {shortWeekday(d.date)}
              </SvgText>
            </React.Fragment>
          );
        })}
        <Line x1={0} x2={width} y1={y(goal)} y2={y(goal)} stroke={colors.textMuted} strokeDasharray="4 4" strokeWidth={1} />
        {average > 0 && (
          <Line x1={0} x2={width} y1={y(average)} y2={y(average)} stroke={colors.protein} strokeWidth={1.5} />
        )}
      </Svg>
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 6 }}>
        <Text style={type.small}>┄ Goal {goal}</Text>
        {average > 0 && <Text style={[type.small, { color: colors.protein }]}>— Avg {Math.round(average)}</Text>}
      </View>
    </View>
  );
}
