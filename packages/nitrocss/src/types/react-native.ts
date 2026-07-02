import "react-native";

declare module "react-native" {
  interface ViewProps {
    className?: string;
  }

  interface TextProps {
    className?: string;
    selectionColorClassName?: string;
  }

  interface TextInputProps {
    className?: string;
    cursorColorClassName?: string;
    placeholderTextColorClassName?: string;
    selectionColorClassName?: string;
    selectionHandleColorClassName?: string;
    underlineColorAndroidClassName?: string;
  }

  interface ImagePropsBase {
    className?: string;
    fillClassName?: string;
    tintColorClassName?: string;
  }

  interface ActivityIndicatorProps {
    className?: string;
    colorClassName?: string;
    tintColorClassName?: string;
  }

  interface SwitchProps {
    className?: string;
    thumbColorClassName?: string;
    trackColorFalseClassName?: string;
    trackColorTrueClassName?: string;
  }

  interface ScrollViewProps {
    className?: string;
    contentContainerClassName?: string;
  }

  interface FlatListProps<ItemT> {
    className?: string;
    contentContainerClassName?: string;
  }

  interface SectionListProps<ItemT, SectionT> {
    className?: string;
    contentContainerClassName?: string;
  }
}

export {};
