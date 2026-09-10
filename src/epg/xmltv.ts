export type EpgChannelMeta = {
  id: string;
  displayNames: string[];
};

export type EpgProgramme = {
  start: number;
  stop: number;
  title: string;
  desc?: string;
  category?: string;
};

export type ParsedXmltv = {
  channels: EpgChannelMeta[];
  programmes: Map<string, EpgProgramme[]>;
};

/** Parse XMLTV datetime like `20260908005900 +0000` to Unix ms. */
export function parseXmltvTime(value: string): number {
  const trimmed = value.trim();
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/.exec(trimmed);
  if (!match) return NaN;
  const [, year, month, day, hour, minute, second, offset] = match;
  const utc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  if (!offset) return utc;
  const sign = offset[0] === "-" ? -1 : 1;
  const offHours = Number(offset.slice(1, 3));
  const offMinutes = Number(offset.slice(3, 5));
  const offMs = sign * (offHours * 60 + offMinutes) * 60_000;
  return utc - offMs;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function firstTagContent(block: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = re.exec(block);
  if (!match) return undefined;
  return decodeXmlEntities(match[1]!.replace(/\s+/g, " ").trim());
}

function allTagContents(block: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const found: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(block))) {
    const text = decodeXmlEntities(match[1]!.replace(/\s+/g, " ").trim());
    if (text) found.push(text);
  }
  return found;
}

export function parseXmltv(xml: string): ParsedXmltv {
  const channels: EpgChannelMeta[] = [];
  const programmes = new Map<string, EpgProgramme[]>();

  const channelRe = /<channel\s+([^>]*?)>([\s\S]*?)<\/channel>/gi;
  let channelMatch: RegExpExecArray | null;
  while ((channelMatch = channelRe.exec(xml))) {
    const attrs = channelMatch[1] ?? "";
    const body = channelMatch[2] ?? "";
    const idMatch = /\bid\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
    const id = idMatch?.[1] ?? idMatch?.[2];
    if (!id) continue;
    channels.push({ id, displayNames: allTagContents(body, "display-name") });
  }

  const programmeRe = /<programme\s+([^>]*?)>([\s\S]*?)<\/programme>/gi;
  let progMatch: RegExpExecArray | null;
  while ((progMatch = programmeRe.exec(xml))) {
    const attrs = progMatch[1] ?? "";
    const body = progMatch[2] ?? "";
    const startMatch = /\bstart\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
    const stopMatch = /\bstop\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
    const channelMatch = /\bchannel\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
    const startRaw = startMatch?.[1] ?? startMatch?.[2];
    const stopRaw = stopMatch?.[1] ?? stopMatch?.[2];
    const channelId = channelMatch?.[1] ?? channelMatch?.[2];
    if (!startRaw || !stopRaw || !channelId) continue;
    const start = parseXmltvTime(startRaw);
    const stop = parseXmltvTime(stopRaw);
    const title = firstTagContent(body, "title");
    if (!title || !Number.isFinite(start) || !Number.isFinite(stop)) continue;
    const programme: EpgProgramme = {
      start,
      stop,
      title,
      desc: firstTagContent(body, "desc"),
      category: firstTagContent(body, "category"),
    };
    const list = programmes.get(channelId) ?? [];
    list.push(programme);
    programmes.set(channelId, list);
  }

  for (const list of programmes.values()) {
    list.sort((a, b) => a.start - b.start);
  }

  return { channels, programmes };
}

export function gunzipXmltv(data: Uint8Array): string {
  if (typeof Bun !== "undefined" && "gunzipSync" in Bun) {
    const bytes = new Uint8Array(data);
    return new TextDecoder("utf-8").decode(Bun.gunzipSync(bytes));
  }
  throw new Error("gunzip requires Bun runtime");
}
