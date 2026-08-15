/** React Native Web never has the C++ HybridObject engine. */
export function getEngine(): null {
  return null;
}

/** Browser CSS owns style application on web. */
export function hasNativeEngine(): false {
  return false;
}
