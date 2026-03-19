import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { MemoryRouter, MemoryRouterProps } from 'react-router-dom';

interface RenderWithRouterOptions extends Omit<RenderOptions, 'wrapper'> {
  routerProps?: MemoryRouterProps;
}

/**
 * Wraps the component under test in a MemoryRouter, required for components
 * that use react-router-dom hooks or components (Link, useNavigate, etc.).
 */
export function renderWithRouter(
  ui: React.ReactElement,
  { routerProps, ...renderOptions }: RenderWithRouterOptions = {},
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <MemoryRouter {...routerProps}>{children}</MemoryRouter>;
  }
  return render(ui, { wrapper: Wrapper, ...renderOptions });
}
