// Port of stripHiddenLinkPreviewContent from desktop/src/shared/lib/linkPreview.ts (types stripped)
const MARKDOWN_SUPPORTED_LINK_RE =
  /!?\[([^\]\n]+)\]\(((?:https?:\/\/)?(?:(?:www\.)?github\.com|(?:www\.)?linear\.app|drive\.google\.com|docs\.google\.com)\/[^)\s<>"']+)\)/gi;

function maskRanges(content, ranges) {
  if (ranges.length === 0) return content;
  const merged = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  let masked = "";
  let cursor = 0;
  for (const range of merged) {
    masked += content.slice(cursor, range.start);
    masked += content.slice(range.start, range.end).replace(/[^\n]/g, " ");
    cursor = range.end;
  }
  return masked + content.slice(cursor);
}

function isIndexInRanges(index, ranges) {
  return ranges.some((range) => index >= range.start && index < range.end);
}
function overlapsRange(start, end, ranges) {
  return ranges.some((range) => start < range.end && end > range.start);
}

function collectCodeRanges(content) {
  const ranges = [];
  for (const match of content.matchAll(/```[\s\S]*?```|~~~[\s\S]*?~~~/g)) {
    ranges.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
  }
  for (const match of content.matchAll(/`[^`\n]*`/g)) {
    ranges.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
  }
  for (const match of content.matchAll(/^(?: {4}|\t).*(?:\n|$)/gm)) {
    ranges.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
  }
  return ranges;
}

function collectMarkdownImageLinkRanges(content) {
  const ranges = [];
  for (const match of content.matchAll(MARKDOWN_SUPPORTED_LINK_RE)) {
    if (!match[0]?.startsWith("!")) continue;
    ranges.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
  }
  return ranges;
}

function collectBlockSpoilerRanges(content, excludedRanges) {
  const ranges = [];
  let openStart = null;
  let lineStart = 0;
  while (lineStart < content.length) {
    const newlineIndex = content.indexOf("\n", lineStart);
    const lineEnd = newlineIndex === -1 ? content.length : newlineIndex + 1;
    const line = content.slice(lineStart, newlineIndex === -1 ? lineEnd : newlineIndex);
    if (line.trim() === "||" && !overlapsRange(lineStart, lineEnd, excludedRanges)) {
      if (openStart == null) openStart = lineStart;
      else { ranges.push({ start: openStart, end: lineEnd }); openStart = null; }
    }
    lineStart = lineEnd;
  }
  return ranges;
}

function collectInlineSpoilerRanges(content, excludedRanges) {
  const ranges = [];
  let openStart = null;
  let index = 0;
  while (index < content.length - 1) {
    if (
      content[index] === "|" && content[index + 1] === "|" &&
      !isIndexInRanges(index, excludedRanges) &&
      !isIndexInRanges(index + 1, excludedRanges)
    ) {
      if (openStart == null) openStart = index;
      else { ranges.push({ start: openStart, end: index + 2 }); openStart = null; }
      index += 2;
      continue;
    }
    index += 1;
  }
  return ranges;
}

function strip(content) {
  const codeRanges = collectCodeRanges(content);
  const imageLinkRanges = collectMarkdownImageLinkRanges(content);
  const nonSpoiler = [...codeRanges, ...imageLinkRanges];
  const block = collectBlockSpoilerRanges(content, nonSpoiler);
  const inline = collectInlineSpoilerRanges(content, [...nonSpoiler, ...block]);
  return { out: maskRanges(content, [...nonSpoiler, ...block, ...inline]), nCode: codeRanges.length, nBlock: block.length, nInline: inline.length };
}

const TARGET = 256 * 1024;
const unit = "`a`\n||\n"; // 8 bytes: one inline-code span line + one block-spoiler delimiter line
const content = unit.repeat(Math.floor(TARGET / unit.length));
console.log("content bytes:", content.length);
const t0 = process.hrtime.bigint();
const r = strip(content);
const t1 = process.hrtime.bigint();
console.log("strip ms:", Number(t1 - t0) / 1e6, "codeRanges:", r.nCode, "block:", r.nBlock, "inline:", r.nInline);
