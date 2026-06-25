/**
 * Tiny dependency-free syntax highlighter for the text formats a GoldSrc mod
 * carries. Picks a grammar *profile* by file extension and lexes into typed
 * tokens; the viewer renders each token as a `tok-<type>` span.
 *
 * Profiles:
 *   clike       .sc (event-script language), .fgd        — C-ish
 *   keyvalues   .vdf .res .gam .lst                       — Valve KeyValues
 *   ini         .ini                                       — [section] key=value
 *   config      .cfg .rc .txt .def                         — console commands
 *   plain       everything else                            — no coloring
 */

export type TokType =
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "variable"
  | "func"
  | "key"
  | "section"
  | "operator"
  | "punct"
  | "plain";

export interface Tok {
  t: TokType;
  v: string;
}

export type Profile = "clike" | "keyvalues" | "ini" | "config" | "plain";

export function profileFor(ext: string): Profile {
  switch (ext.toLowerCase()) {
    case "sc":
    case "fgd":
      return "clike";
    case "vdf":
    case "res":
    case "gam":
    case "lst":
      return "keyvalues";
    case "ini":
      return "ini";
    case "cfg":
    case "rc":
    case "txt":
    case "def":
      return "config";
    default:
      return "plain";
  }
}

type Rule = [TokType, RegExp];

const STRING: Rule = ["string", /"(?:[^"\\\n]|\\.)*"?/y];
const WS: Rule = ["plain", /\s+/y];
const NUMBER: Rule = ["number", /-?\b\d+(?:\.\d+)?\b/y];

const SC_KEYWORDS =
  /\b(?:public|new|for|if|else|while|do|return|break|continue|switch|case|default|true|false|null|void|int|float|string|bool)\b/y;

const PROFILES: Record<Exclude<Profile, "plain">, Rule[]> = {
  clike: [
    ["comment", /\/\*[\s\S]*?\*\//y],
    ["comment", /\/\/[^\n]*/y],
    STRING,
    ["variable", /\$[A-Za-z_]\w*/y],
    NUMBER,
    ["keyword", SC_KEYWORDS],
    ["func", /[A-Za-z_]\w*(?=\s*\()/y],
    ["plain", /[A-Za-z_]\w*/y],
    ["operator", /[-+*/%=<>!&|^~?:]+/y],
    ["punct", /[{}[\]();,.]/y],
    WS,
  ],
  keyvalues: [
    ["comment", /\/\/[^\n]*/y],
    STRING,
    NUMBER,
    ["punct", /[{}[\]]/y],
    ["plain", /[^\s{}[\]"]+/y],
    WS,
  ],
  ini: [
    ["comment", /[;#][^\n]*/y],
    ["section", /\[[^\]\n]*\]/y],
    STRING,
    ["operator", /[=:]/y],
    NUMBER,
    ["plain", /[^\s=:]+/y],
    WS,
  ],
  config: [
    ["comment", /\/\/[^\n]*/y],
    STRING,
    NUMBER,
    ["plain", /[^\s"]+/y],
    WS,
  ],
};

/** Lex with a sticky-regex rule list; unmatched chars fall through as plain. */
function lex(text: string, rules: Rule[]): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < text.length) {
    let hit = false;
    for (const [t, re] of rules) {
      re.lastIndex = i;
      const m = re.exec(text);
      if (m && m.index === i && m[0].length > 0) {
        out.push({ t, v: m[0] });
        i += m[0].length;
        hit = true;
        break;
      }
    }
    if (!hit) {
      out.push({ t: "plain", v: text[i]! });
      i++;
    }
  }
  return out;
}

const newlineBefore = (v: string) => v.includes("\n");

/** Promote the line-leading token to `key` (KeyValues) / `keyword` (config),
 *  and the word before `=`/`:` to `key` (ini) — context regex can't do alone. */
function refine(toks: Tok[], profile: Profile): Tok[] {
  if (profile === "keyvalues") {
    let firstOnLine = true;
    for (const tok of toks) {
      if (tok.t === "plain" && newlineBefore(tok.v)) firstOnLine = true;
      else if (tok.t === "string" || tok.t === "plain") {
        if (tok.t === "string" && firstOnLine) tok.t = "key";
        if (!/^\s*$/.test(tok.v)) firstOnLine = false;
      }
    }
  } else if (profile === "config") {
    let firstOnLine = true;
    for (const tok of toks) {
      if (tok.t === "plain" && newlineBefore(tok.v)) firstOnLine = true;
      else if (tok.t !== "comment") {
        if ((tok.t === "plain" || tok.t === "string") && !/^\s*$/.test(tok.v)) {
          if (firstOnLine && tok.t === "plain") tok.t = "keyword";
          firstOnLine = false;
        }
      }
    }
  } else if (profile === "ini") {
    for (let i = 0; i < toks.length; i++) {
      if (toks[i]!.t === "operator" && (toks[i]!.v === "=" || toks[i]!.v === ":")) {
        // walk back over whitespace to the key word
        for (let j = i - 1; j >= 0; j--) {
          if (toks[j]!.t === "plain" && /^\s*$/.test(toks[j]!.v)) continue;
          if (toks[j]!.t === "plain") toks[j]!.t = "key";
          break;
        }
      }
    }
  }
  return toks;
}

/** Highlight `text` for a file `ext`. Returns one big plain token (no coloring)
 *  for the `plain` profile or oversized inputs (keeps rendering snappy). */
export function highlight(text: string, ext: string): Tok[] {
  const profile = profileFor(ext);
  if (profile === "plain" || text.length > 200_000) {
    return [{ t: "plain", v: text }];
  }
  return refine(lex(text, PROFILES[profile]), profile);
}
