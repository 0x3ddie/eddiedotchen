// Minimal PDF text extraction, used only to check that content/resume.md still
// says what the resume PDF says. It handles the PDFs this site actually ships
// (Google Docs / Skia export: Flate-compressed content streams, Type0 fonts
// with ToUnicode CMaps). It is not a general PDF parser; when it cannot read a
// file it returns null and the caller reports that instead of guessing.

import fs from "node:fs";
import zlib from "node:zlib";

function readObjects(buf) {
  const text = buf.toString("latin1");
  const objects = new Map();
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  while ((m = re.exec(text))) {
    const start = m.index + m[0].length;
    const end = text.indexOf("endobj", start);
    if (end === -1) break;
    const body = text.slice(start, end);
    let stream = null;
    const s = /stream\r?\n/.exec(body);
    if (s) {
      const sStart = start + s.index + s[0].length;
      const sEnd = text.indexOf("endstream", sStart);
      const raw = buf.subarray(sStart, sEnd);
      try {
        stream = /\/FlateDecode/.test(body.slice(0, s.index))
          ? zlib.inflateSync(raw)
          : raw;
      } catch {
        stream = null;
      }
    }
    objects.set(Number(m[1]), { dict: s ? body.slice(0, s.index) : body, stream });
    re.lastIndex = end;
  }
  return objects;
}

function parseToUnicode(cmap) {
  const map = new Map();
  const hexToString = (hex) => {
    let out = "";
    for (let i = 0; i + 4 <= hex.length; i += 4) {
      out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    }
    return out;
  };
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) {
      map.set(parseInt(pair[1], 16), hexToString(pair[2]));
    }
  }
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]+)>|\[([^\]]*)\])/g;
    for (const r of block[1].matchAll(re)) {
      const lo = parseInt(r[1], 16);
      const hi = parseInt(r[2], 16);
      if (r[3] !== undefined) {
        const base = hexToString(r[3]);
        const head = base.slice(0, -1);
        const last = base.charCodeAt(base.length - 1);
        for (let c = lo; c <= hi; c++) {
          map.set(c, head + String.fromCharCode(last + (c - lo)));
        }
      } else {
        const items = [...r[4].matchAll(/<([0-9a-fA-F]+)>/g)].map((x) => hexToString(x[1]));
        for (let c = lo; c <= hi && c - lo < items.length; c++) map.set(c, items[c - lo]);
      }
    }
  }
  return map;
}

/** Returns the text of every page, or null when the PDF is not one we can read. */
export function extractPdfText(filePath) {
  const buf = fs.readFileSync(filePath);
  const objects = readObjects(buf);
  if (objects.size === 0) return null;

  // Resource name (/F4) -> ToUnicode map, gathered from every /Font dictionary.
  const fonts = new Map();
  for (const { dict } of objects.values()) {
    for (const fontDict of dict.matchAll(/\/Font\s*<<([\s\S]*?)>>/g)) {
      for (const ref of fontDict[1].matchAll(/\/([A-Za-z0-9]+)\s+(\d+)\s+\d+\s+R/g)) {
        const font = objects.get(Number(ref[2]));
        const toUnicode = font && /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(font.dict);
        const cmap = toUnicode && objects.get(Number(toUnicode[1]));
        if (cmap && cmap.stream) {
          fonts.set(ref[1], parseToUnicode(cmap.stream.toString("latin1")));
        }
      }
    }
  }
  if (fonts.size === 0) return null;

  let out = "";
  let decoded = 0;
  for (const { stream } of objects.values()) {
    if (!stream) continue;
    const content = stream.toString("latin1");
    if (!/\bBT\b/.test(content) || !/\bTf\b/.test(content)) continue;
    let font = null;
    const token = /\/([A-Za-z0-9]+)\s+[\d.]+\s+Tf|\[((?:[^\]\\]|\\.)*)\]\s*TJ|<([0-9a-fA-F\s]*)>\s*Tj|\b(Tm|Td|TD|T\*|ET)\b/g;
    const decode = (hex) => {
      const clean = hex.replace(/\s+/g, "");
      let s = "";
      for (let i = 0; i + 4 <= clean.length; i += 4) {
        const ch = font && font.get(parseInt(clean.slice(i, i + 4), 16));
        if (ch !== undefined) {
          s += ch;
          decoded++;
        }
      }
      return s;
    };
    let t;
    while ((t = token.exec(content))) {
      if (t[1]) font = fonts.get(t[1]) || null;
      else if (t[2] !== undefined) {
        for (const part of t[2].matchAll(/<([0-9a-fA-F\s]*)>|(-?[\d.]+)/g)) {
          if (part[1] !== undefined) out += decode(part[1]);
        }
      } else if (t[3] !== undefined) out += decode(t[3]);
      else if (t[4] === "ET") out += "\n";
    }
  }
  return decoded > 0 ? out : null;
}
