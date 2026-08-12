const React = require('react');
const {View} = require('react-native');

const sharedValues = new WeakSet();

const Animated = {
  View,
  createAnimatedComponent: Component => Component,
};

module.exports = {
  __esModule: true,
  default: Animated,
  useSharedValue: initial => {
    const ref = React.useRef();
    if (!ref.current) {
      ref.current = {value: initial};
      sharedValues.add(ref.current);
    }
    return ref.current;
  },
  useAnimatedStyle: factory => factory(),
  withTiming: value => value,
};
