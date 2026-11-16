// Splits the test text into segments so matches and capture groups can be highlighted without
// injecting markup: the caller renders each segment as a text node or a styled span.

export function buildSegments(text, matches) {
  const cuts = new Set([0, text.length]);
  for (const m of matches) {
    cuts.add(m.index); cuts.add(m.end);
    for (const g of m.groupDetails || []) if (g.start !== null && g.start !== undefined) { cuts.add(g.start); cuts.add(g.end); }
  }
  const points = [...cuts].filter(p => p >= 0 && p <= text.length).sort((a, b) => a - b);
  const segments = [];
  for (let k = 0; k < points.length - 1; k++) {
    const start = points[k], end = points[k + 1];
    if (start === end) continue;
    let matchIndex = -1;
    const groupIds = [];
    matches.forEach((m, mi) => {
      if (start >= m.index && end <= m.end && m.end > m.index) {
        matchIndex = mi;
        for (const g of m.groupDetails || []) if (g.start !== null && g.start !== undefined && start >= g.start && end <= g.end && g.end > g.start) groupIds.push(g.index);
      }
    });
    segments.push({ start, end, text: text.slice(start, end), matchIndex, groups: groupIds });
  }
  // Zero-width matches have no characters to colour; report them so the UI can mark the position.
  const zeroWidth = matches.map((m, mi) => ({ mi, at: m.index })).filter((_, i) => matches[i].end === matches[i].index);
  return { segments, zeroWidth };
}
