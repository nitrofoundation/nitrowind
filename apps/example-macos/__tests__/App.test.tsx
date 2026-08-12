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
    'Core components',
    'Pointer & keyboard',
    'Responsive layout',
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

test('exercises desktop input and keyboard interaction state', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(() =>
    renderer.root.findByProps({accessibilityLabel: 'Core components'}).props.onPress(),
  );
  const input = renderer.root.findByProps({
    accessibilityLabel: 'macOS example text input',
  });
  await ReactTestRenderer.act(() => input.props.onChangeText('Keyboard ready'));
  expect(
    renderer.root.findByProps({accessibilityLabel: 'macOS example text input'}).props.value,
  ).toBe('Keyboard ready');

  await ReactTestRenderer.act(() =>
    renderer.root.findByProps({accessibilityLabel: 'Pointer & keyboard'}).props.onPress(),
  );
  const target = renderer.root.findByProps({
    accessibilityLabel: 'Desktop interaction target',
  });
  await ReactTestRenderer.act(() => target.props.onPress());
  expect(renderer.root.findAllByType('Text' as never).some(node =>
    Array.isArray(node.props.children)
      ? node.props.children.join('') === 'Activations: 1'
      : node.props.children === 'Activations: 1',
  )).toBe(true);
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
