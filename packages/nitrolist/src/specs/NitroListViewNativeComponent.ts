import codegenNativeComponent from "react-native/Libraries/Utilities/codegenNativeComponent";
import type {
  Double,
  DirectEventHandler,
  Int32,
} from "react-native/Libraries/Types/CodegenTypes";
import type { ViewProps } from "react-native";

export type NitroListViewabilityChangeEvent = {
  firstVisibleIndex: Int32;
  lastVisibleIndex: Int32;
  visibleIndices: Int32[];
  renderedIndices: Int32[];
  outsideViewportIndices: Int32[];
  visibleIds: string[];
  renderedIds: string[];
  outsideViewportIds: string[];
};

export interface NitroListViewProps extends ViewProps {
  contentInsetBottom?: Double;
  contentInsetTop?: Double;
  handle: Int32;
  onViewabilityChange?: DirectEventHandler<NitroListViewabilityChangeEvent>;
}

export default codegenNativeComponent<NitroListViewProps>("NitroListView");
