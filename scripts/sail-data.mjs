import { boundsForPoints, getTrackStats, withSyntheticTimes } from "./field-utils.mjs";

export function prepareSail(points) {
  if (points.length < 2) throw new Error("A sail needs at least two recorded positions");
  const times = points.map((point) => point.time ? Date.parse(point.time) : NaN);
  const hasRecordedTiming = times.every((time, index) => Number.isFinite(time) && (!index || time > times[index - 1]));
  const playbackPoints = hasRecordedTiming ? points : withSyntheticTimes(points.map((point) => ({ ...point, time: null })));
  const playbackStats = getTrackStats(playbackPoints);
  return {
    points: playbackPoints,
    bounds: boundsForPoints(points),
    hasRecordedTiming,
    playbackHours: playbackStats.hours,
    stats: {
      ...playbackStats,
      hours: hasRecordedTiming ? playbackStats.hours : null,
      avgMph: hasRecordedTiming ? playbackStats.avgMph : null
    }
  };
}
