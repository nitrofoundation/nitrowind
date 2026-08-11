/** Runtime inputs used to resolve CSS math without a React render. */
export interface CssMathRuntime {
  viewportWidth?: number;
  viewportHeight?: number;
  containerWidth?: number;
  containerHeight?: number;
  /** Inline axis. Defaults to width. */
  containerInlineSize?: number;
  /** Block axis. Defaults to height. */
  containerBlockSize?: number;
  percentBase?: number;
  rem?: number;
  em?: number;
  variables?: Readonly<Record<string, string | number | CssMathNode>>;
}

export type CssMathUnit =
  | "number"
  | "px"
  | "%"
  | "rem"
  | "em"
  | "vw"
  | "vh"
  | "vmin"
  | "vmax"
  | "cqw"
  | "cqh"
  | "cqi"
  | "cqb";

export type CssMathNode =
  | { type: "value"; value: number; unit: CssMathUnit }
  | { type: "variable"; name: string; fallback?: CssMathNode }
  | { type: "negate"; value: CssMathNode }
  | {
      type: "operation";
      operator: "+" | "-" | "*" | "/";
      left: CssMathNode;
      right: CssMathNode;
    }
  | { type: "function"; name: "min" | "max" | "clamp"; values: CssMathNode[] };

export interface CssMathDescriptor {
  $cssMath: CssMathNode;
  dependencies: readonly CssMathDependency[];
}

export type CssMathDependency =
  | "viewport"
  | "container"
  | "percent-base"
  | "font-size"
  | "root-font-size"
  | `variable:${string}`;

const SUPPORTED_UNITS = new Set<CssMathUnit>([
  "number",
  "px",
  "%",
  "rem",
  "em",
  "vw",
  "vh",
  "vmin",
  "vmax",
  "cqw",
  "cqh",
  "cqi",
  "cqb",
]);

type Token =
  | { type: "number"; value: number; unit: CssMathUnit }
  | { type: "ident"; value: string }
  | { type: "operator"; value: "+" | "-" | "*" | "/" }
  | { type: "punctuation"; value: "(" | ")" | "," };

function tokenize(source: string): Token[] | undefined {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    const whitespace = /^\s+/.exec(rest);
    if (whitespace) {
      index += whitespace[0].length;
      continue;
    }
    const number = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
    if (number) {
      index += number[0].length;
      const unitMatch = /^(%|[a-zA-Z]+)/.exec(source.slice(index));
      const unit = (unitMatch?.[1]?.toLowerCase() ?? "number") as CssMathUnit;
      if (!SUPPORTED_UNITS.has(unit)) return undefined;
      if (unitMatch) index += unitMatch[0].length;
      const value = Number(number[0]);
      if (!Number.isFinite(value)) return undefined;
      tokens.push({ type: "number", value, unit });
      continue;
    }
    const ident = /^(?:--[a-zA-Z0-9_-]+|[a-zA-Z][a-zA-Z0-9_-]*)/.exec(rest);
    if (ident) {
      tokens.push({ type: "ident", value: ident[0] });
      index += ident[0].length;
      continue;
    }
    const char = source[index]!;
    if (char === "+" || char === "-" || char === "*" || char === "/") {
      tokens.push({ type: "operator", value: char });
      index += 1;
      continue;
    }
    if (char === "(" || char === ")" || char === ",") {
      tokens.push({ type: "punctuation", value: char });
      index += 1;
      continue;
    }
    return undefined;
  }
  return tokens;
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  parse(): CssMathNode | undefined {
    const result = this.expression();
    return result && this.index === this.tokens.length ? result : undefined;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private take(): Token | undefined {
    return this.tokens[this.index++];
  }

  private expression(): CssMathNode | undefined {
    let left = this.product();
    if (!left) return undefined;
    while (
      this.peek()?.type === "operator" &&
      (this.peek() as { value: string }).value.match(/^[+-]$/)
    ) {
      const operator = (this.take() as { value: "+" | "-" }).value;
      const right = this.product();
      if (!right) return undefined;
      left = { type: "operation", operator, left, right };
    }
    return left;
  }

  private product(): CssMathNode | undefined {
    let left = this.unary();
    if (!left) return undefined;
    while (
      this.peek()?.type === "operator" &&
      (this.peek() as { value: string }).value.match(/^[*/]$/)
    ) {
      const operator = (this.take() as { value: "*" | "/" }).value;
      const right = this.unary();
      if (!right) return undefined;
      left = { type: "operation", operator, left, right };
    }
    return left;
  }

  private unary(): CssMathNode | undefined {
    const token = this.peek();
    if (token?.type === "operator" && (token.value === "+" || token.value === "-")) {
      this.take();
      const value = this.unary();
      if (!value) return undefined;
      return token.value === "-" ? { type: "negate", value } : value;
    }
    return this.primary();
  }

  private primary(): CssMathNode | undefined {
    const token = this.take();
    if (!token) return undefined;
    if (token.type === "number") return { type: "value", value: token.value, unit: token.unit };
    if (token.type === "punctuation" && token.value === "(") {
      const value = this.expression();
      const close = this.take();
      return value && close?.type === "punctuation" && close.value === ")" ? value : undefined;
    }
    if (token.type !== "ident") return undefined;
    const open = this.take();
    if (open?.type !== "punctuation" || open.value !== "(") return undefined;
    const name = token.value.toLowerCase();
    if (name === "calc") {
      const value = this.expression();
      const close = this.take();
      return value && close?.type === "punctuation" && close.value === ")" ? value : undefined;
    }
    if (name === "var") return this.variable();
    if (name !== "min" && name !== "max" && name !== "clamp") return undefined;
    const values = this.arguments();
    if (!values || (name === "clamp" ? values.length !== 3 : values.length === 0)) return undefined;
    return { type: "function", name, values };
  }

  private variable(): CssMathNode | undefined {
    const name = this.take();
    if (name?.type !== "ident" || !name.value.startsWith("--")) return undefined;
    let fallback: CssMathNode | undefined;
    if (this.peek()?.type === "punctuation" && this.peek()?.value === ",") {
      this.take();
      fallback = this.expression();
      if (!fallback) return undefined;
    }
    const close = this.take();
    if (close?.type !== "punctuation" || close.value !== ")") return undefined;
    return fallback
      ? { type: "variable", name: name.value, fallback }
      : { type: "variable", name: name.value };
  }

  private arguments(): CssMathNode[] | undefined {
    const values: CssMathNode[] = [];
    for (;;) {
      const value = this.expression();
      if (!value) return undefined;
      values.push(value);
      const separator = this.take();
      if (separator?.type !== "punctuation") return undefined;
      if (separator.value === ")") return values;
      if (separator.value !== ",") return undefined;
    }
  }
}

function collectDependencies(node: CssMathNode, into: Set<CssMathDependency>): void {
  if (node.type === "value") {
    if (["vw", "vh", "vmin", "vmax"].includes(node.unit)) into.add("viewport");
    else if (["cqw", "cqh", "cqi", "cqb"].includes(node.unit)) into.add("container");
    else if (node.unit === "%") into.add("percent-base");
    else if (node.unit === "em") into.add("font-size");
    else if (node.unit === "rem") into.add("root-font-size");
    return;
  }
  if (node.type === "variable") {
    into.add(`variable:${node.name}`);
    if (node.fallback) collectDependencies(node.fallback, into);
    return;
  }
  if (node.type === "negate") return collectDependencies(node.value, into);
  if (node.type === "operation") {
    collectDependencies(node.left, into);
    collectDependencies(node.right, into);
    return;
  }
  for (const value of node.values) collectDependencies(value, into);
}

/** Parse a CSS math expression into a JSON-safe descriptor. */
export function parseCssMath(value: string): CssMathDescriptor | undefined {
  const tokens = tokenize(value.trim());
  if (!tokens?.length) return undefined;
  const node = new Parser(tokens).parse();
  if (!node) return undefined;
  const dependencies = new Set<CssMathDependency>();
  collectDependencies(node, dependencies);
  return { $cssMath: node, dependencies: [...dependencies].sort() };
}

const finite = (value: number | undefined): number | undefined =>
  value !== undefined && Number.isFinite(value) ? value : undefined;

function resolveUnit(
  node: Extract<CssMathNode, { type: "value" }>,
  runtime: CssMathRuntime,
): number | undefined {
  const { value, unit } = node;
  if (unit === "number" || unit === "px") return value;
  if (unit === "%") {
    return finite(runtime.percentBase) === undefined
      ? undefined
      : (value * runtime.percentBase!) / 100;
  }
  if (unit === "rem") return value * (runtime.rem ?? 16);
  if (unit === "em") return value * (runtime.em ?? runtime.rem ?? 16);
  const vw = finite(runtime.viewportWidth);
  const vh = finite(runtime.viewportHeight);
  if (unit === "vw") return vw === undefined ? undefined : (value * vw) / 100;
  if (unit === "vh") return vh === undefined ? undefined : (value * vh) / 100;
  if (unit === "vmin") {
    return vw === undefined || vh === undefined
      ? undefined
      : (value * Math.min(vw, vh)) / 100;
  }
  if (unit === "vmax") {
    return vw === undefined || vh === undefined
      ? undefined
      : (value * Math.max(vw, vh)) / 100;
  }
  const cw = finite(runtime.containerWidth);
  const ch = finite(runtime.containerHeight);
  const ci = finite(runtime.containerInlineSize) ?? cw;
  const cb = finite(runtime.containerBlockSize) ?? ch;
  const base = unit === "cqw" ? cw : unit === "cqh" ? ch : unit === "cqi" ? ci : cb;
  return base === undefined ? undefined : (value * base) / 100;
}

function evaluateNode(
  node: CssMathNode,
  runtime: CssMathRuntime,
  seen: Set<string>,
): number | undefined {
  if (node.type === "value") return resolveUnit(node, runtime);
  if (node.type === "negate") {
    const value = evaluateNode(node.value, runtime, seen);
    return value === undefined ? undefined : -value;
  }
  if (node.type === "variable") {
    if (seen.has(node.name)) {
      return node.fallback
        ? evaluateNode(node.fallback, runtime, seen)
        : undefined;
    }
    const raw = runtime.variables?.[node.name];
    if (raw === undefined) {
      return node.fallback
        ? evaluateNode(node.fallback, runtime, seen)
        : undefined;
    }
    if (typeof raw === "number") return finite(raw);
    const next = typeof raw === "string" ? parseCssMath(raw)?.$cssMath : raw;
    if (!next) return node.fallback ? evaluateNode(node.fallback, runtime, seen) : undefined;
    const nestedSeen = new Set(seen).add(node.name);
    return evaluateNode(next, runtime, nestedSeen);
  }
  if (node.type === "operation") {
    const left = evaluateNode(node.left, runtime, seen);
    const right = evaluateNode(node.right, runtime, seen);
    if (left === undefined || right === undefined) return undefined;
    const result =
      node.operator === "+"
        ? left + right
        : node.operator === "-"
          ? left - right
          : node.operator === "*"
            ? left * right
            : right === 0
              ? undefined
              : left / right;
    return finite(result);
  }
  const values = node.values.map((value) => evaluateNode(value, runtime, seen));
  if (values.some((value) => value === undefined)) return undefined;
  const resolved = values as number[];
  if (node.name === "min") return Math.min(...resolved);
  if (node.name === "max") return Math.max(...resolved);
  return Math.max(resolved[0]!, Math.min(resolved[1]!, resolved[2]!));
}

/** Resolve a compiled CSS math descriptor against a native runtime snapshot. */
export function evaluateCssMath(
  descriptor: CssMathDescriptor | CssMathNode,
  runtime: CssMathRuntime,
): number | undefined {
  const node = "$cssMath" in descriptor ? descriptor.$cssMath : descriptor;
  return evaluateNode(node, runtime, new Set());
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
}

/** Canonical CSS-like serialization, useful in diagnostics and cache keys. */
export function serializeCssMath(value: CssMathDescriptor | CssMathNode): string {
  const node = "$cssMath" in value ? value.$cssMath : value;
  if (node.type === "value") {
    return `${formatNumber(node.value)}${node.unit === "number" ? "" : node.unit}`;
  }
  if (node.type === "variable") {
    return `var(${node.name}${node.fallback ? `, ${serializeCssMath(node.fallback)}` : ""})`;
  }
  if (node.type === "negate") return `-${serializeCssMath(node.value)}`;
  if (node.type === "operation") {
    return `calc(${serializeCssMath(node.left)} ${node.operator} ${serializeCssMath(node.right)})`;
  }
  return `${node.name}(${node.values.map(serializeCssMath).join(", ")})`;
}

export const isCssMathDescriptor = (value: unknown): value is CssMathDescriptor =>
  typeof value === "object" && value !== null && "$cssMath" in value;
