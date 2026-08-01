function isIndexInRanges(index, ranges) {
  return ranges.some((r) => index >= r.start && index < r.end);
}
function overlapsRange(start, end, ranges) {
  return ranges.some((r) => start < r.end && end > r.start);
}
function collectCodeRanges(content) {
  const ranges = [];
  for (const m of content.matchAll(/```[\s\S]*?```|~~~[\s\S]*?~~~/g))
    ranges.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  for (const m of content.matchAll(/`[^`\n]*`/g))
    ranges.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  for (const m of content.matchAll(/^(?: {4}|\t).*(?:\n|$)/gm))
    ranges.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  return ranges;
}
function collectBlockSpoilerRanges(content, excluded) {
  const ranges = [];
  let openStart = null;
  let lineStart = 0;
  while (lineStart < content.length) {
    const nl = content.indexOf("\n", lineStart);
    const lineEnd = nl === -1 ? content.length : nl + 1;
    const line = content.slice(lineStart, nl === -1 ? lineEnd : nl);
    if (line.trim() === "||" && !overlapsRange(lineStart, lineEnd, excluded)) {
      if (openStart == null) openStart = lineStart;
      else {
        ranges.push({ start: openStart, end: lineEnd });
        openStart = null;
      }
    }
    lineStart = lineEnd;
  }
  return ranges;
}
function collectInlineSpoilerRanges(content, excluded) {
  const ranges = [];
  let openStart = null;
  let index = 0;
  while (index < content.length - 1) {
    if (
      content[index] === "|" &&
      content[index + 1] === "|" &&
      !isIndexInRanges(index, excluded) &&
      !isIndexInRanges(index + 1, excluded)
    ) {
      if (openStart == null) openStart = index;
      else {
        ranges.push({ start: openStart, end: index + 2 });
        openStart = null;
      }
      index += 2;
      continue;
    }
    index += 1;
  }
  return ranges;
}
function strip(content) {
  const code = collectCodeRanges(content);
  const nonSpoiler = [...code];
  const block = collectBlockSpoilerRanges(content, nonSpoiler);
  const inline = collectInlineSpoilerRanges(content, [...nonSpoiler, ...block]);
  return { code: code.length, block: block.length, inline: inline.length };
}

const unit = "`a`\n||\n";
const n = Math.floor((256 * 1024) / unit.length);
const content = unit.repeat(n);
console.log("bytes", content.length, "units", n);
const t0 = Date.now();
const r = strip(content);
console.log("elapsed ms", Date.now() - t0, r);
