/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});

test('opens each sidebar example in the main canvas', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  const expectedTitles = [
    'macOS overview',
    'Runtime & themes',
    'Native paint',
    'Tag reuse',
  ];

  for (const expectedTitle of expectedTitles) {
    const button = renderer.root.findByProps({
      accessibilityLabel: expectedTitle,
    });
    await ReactTestRenderer.act(() => button.props.onPress());
    const mainTitle = renderer.root.findByProps({
      className: 'text-4xl font-black text-foreground',
    });
    expect(mainTitle.props.children).toBe(expectedTitle);
    const activeButton = renderer.root.findByProps({
      accessibilityLabel: expectedTitle,
    });
    expect(activeButton.props.accessibilityState).toEqual({selected: true});
  }
});

test('hides and restores the sidebar from the toolbar', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(() =>
    renderer.root.findByProps({accessibilityLabel: 'Hide sidebar'}).props.onPress(),
  );
  expect(
    renderer.root.findAllByProps({accessibilityLabel: 'macOS overview'}),
  ).toHaveLength(0);

  await ReactTestRenderer.act(() =>
    renderer.root.findByProps({accessibilityLabel: 'Show sidebar'}).props.onPress(),
  );
  expect(
    renderer.root.findAllByProps({accessibilityLabel: 'macOS overview'}),
  ).not.toHaveLength(0);
});
