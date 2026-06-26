if (__DEV__) {
  const React = require('react');
  const whyDidYouRender = require('@welldone-software/why-did-you-render');

  whyDidYouRender(React, {
    trackAllPureComponents: true,
    collapseGroups: true,
    logOwnerReasons: true,
    titleColor: '#7c3aed',
    diffNameColor: '#0ea5e9',
  });
}
