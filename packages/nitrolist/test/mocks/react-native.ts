import React from "react";

type Props = Record<string, unknown> & { children?: React.ReactNode };

export const Platform = {
  OS: "ios",
  select<T>(specifics: Record<string, T> & { default?: T }) {
    return specifics.ios ?? specifics.default;
  },
};

export const I18nManager = { isRTL: false };

export const View = React.forwardRef<unknown, Props>(function View(
  { children, ...props },
  ref,
) {
  return React.createElement("View", { ...props, ref }, children);
});

export const ScrollView = React.forwardRef<unknown, Props>(function ScrollView(
  { children, ...props },
  ref,
) {
  return React.createElement("ScrollView", { ...props, ref }, children);
});

export const StyleSheet = {
  flatten(style: unknown) {
    if (Array.isArray(style)) return Object.assign({}, ...style);
    return style;
  },
};
