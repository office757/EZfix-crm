/** Pure interval partitioning in rendered pixels; never mutates jobs or dates. */
export function layoutCalendarIntervals(intervals) {
  if (!Array.isArray(intervals)) throw new TypeError('Expected calendar intervals');
  const items = intervals.map((item, order) => {
    if (!item || !Number.isFinite(item.start) || !Number.isFinite(item.end) || item.end <= item.start) {
      throw new TypeError('Calendar intervals must have finite start < end');
    }
    return { ...item, order };
  }).sort((a, b) => a.start - b.start || a.end - b.end || a.order - b.order);
  const output = [];
  let group = [], groupEnd = -Infinity;
  const flush = () => {
    const laneEnds = [];
    for (const item of group) {
      let lane = laneEnds.findIndex(end => end <= item.start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = item.end;
      item.lane = lane;
    }
    for (const { order, ...item } of group) output.push({ ...item, lanes: laneEnds.length });
    group = [];
    groupEnd = -Infinity;
  };
  for (const item of items) {
    // Touching intervals are not overlapping. Each disconnected group starts fresh.
    if (group.length && item.start >= groupEnd) flush();
    group.push(item);
    groupEnd = Math.max(groupEnd, item.end);
  }
  if (group.length) flush();
  return output;
}
