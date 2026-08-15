/**
 * React Native Web owns the DOM class generated from a component's `style`
 * prop, so a raw `className` prop is overwritten. A `$$css` object is RNW's
 * supported compiled-style representation: every string value is copied into
 * the final DOM class list by styleq.
 */
export interface WebClassNameStyle {
  readonly $$css: true;
  readonly $$nitrocss: string;
}

const cache = new Map<string, WebClassNameStyle>();

export function webClassNameStyle<Style extends object>(
  className: string | undefined,
): Style | undefined {
  const normalized = className?.trim();
  if (!normalized) return undefined;

  const cached = cache.get(normalized);
  if (cached) return cached as unknown as Style;

  const style = { $$css: true, $$nitrocss: normalized } as const;
  cache.set(normalized, style);
  return style as unknown as Style;
}
