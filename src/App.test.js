import { render, screen } from '@testing-library/react';

jest.mock('leaflet', () => {
  const Icon = function Icon() {};
  Icon.Default = {
    prototype: {
      _getIconUrl: () => null,
    },
    mergeOptions: jest.fn(),
  };

  const leaflet = {
    Icon,
    latLngBounds: jest.fn(() => ({
      isValid: jest.fn(() => true),
    })),
  };

  return {
    __esModule: true,
    ...leaflet,
    default: leaflet,
  };
});

jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  Marker: ({ children }) => <div>{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
  TileLayer: () => <div />,
}));

import App from './App';

test('renders geocoding comparison heading', () => {
  render(<App />);
  const headingElement = screen.getByText(/geocoding comparison/i);
  expect(headingElement).toBeInTheDocument();
});
