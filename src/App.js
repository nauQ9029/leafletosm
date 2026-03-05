import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMapEvents, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import './App.css';

// Fix for default marker icons in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

const providerConfigs = {
  geoapify: {
    label: 'Geoapify Geocoding + Autocomplete',
    markerColor: 'blue',
  },
  goong: {
    label: 'Goong Geocoding (Vietnam-focused)',
    markerColor: 'green',
  },
  opencage: {
    label: 'OpenCage Geocoding (free tier)',
    markerColor: 'orange',
  },
  locationiq: {
    label: 'LocationIQ Geocoding (free tier)',
    markerColor: 'violet',
  },
  mapbox: {
    label: 'Mapbox Geocoding',
    markerColor: 'black',
  },
  selfHost: {
    label: 'Self-host Nominatim/Photon',
    markerColor: 'red',
  },
};

const markerIconUrls = {
  blue: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  green: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  orange: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
  violet: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png',
  black: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-black.png',
  red: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
};

const createColoredIcon = (color) =>
  new L.Icon({
    iconUrl: markerIconUrls[color],
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [geoapifyKey, setGeoapifyKey] = useState('');
  const [goongKey, setGoongKey] = useState('');
  const [openCageKey, setOpenCageKey] = useState('');
  const [locationIqKey, setLocationIqKey] = useState('');
  const [mapboxKey, setMapboxKey] = useState('');
  const [selfHostType, setSelfHostType] = useState('nominatim');
  const [selfHostBaseUrl, setSelfHostBaseUrl] = useState('');
  const [providerResults, setProviderResults] = useState({});
  const [loading, setLoading] = useState(false);
  const [routeStart, setRouteStart] = useState(null);
  const [routeEnd, setRouteEnd] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const [osrmBaseUrl, setOsrmBaseUrl] = useState('https://router.project-osrm.org');
  const mapRef = useRef();

  const providerIcons = useMemo(
    () => ({
      geoapify: createColoredIcon(providerConfigs.geoapify.markerColor),
      goong: createColoredIcon(providerConfigs.goong.markerColor),
      opencage: createColoredIcon(providerConfigs.opencage.markerColor),
      locationiq: createColoredIcon(providerConfigs.locationiq.markerColor),
      mapbox: createColoredIcon(providerConfigs.mapbox.markerColor),
      selfHost: createColoredIcon(providerConfigs.selfHost.markerColor),
    }),
    []
  );

  const normalizeBaseUrl = (url) => (url || '').trim().replace(/\/+$/, '');

  useEffect(() => {
    const fetchOsrmRoute = async (start, end) => {
      if (!start || !end) return;

      const startStr = `${start.lng},${start.lat}`;
      const endStr = `${end.lng},${end.lat}`;
      const url = normalizeBaseUrl(osrmBaseUrl) || 'https://router.project-osrm.org';
      const endpoint = `${url}/route/v1/driving/${startStr};${endStr}?overview=full&geometries=geojson`;

      try {
        const response = await fetch(endpoint);
        if (!response.ok) {
          throw new Error(`OSRM request failed (${response.status})`);
        }
        const data = await response.json();
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
          setRouteData(data.routes[0].geometry);
        } else {
          setRouteData(null);
        }
      } catch (error) {
        console.error('Failed to fetch OSRM route:', error);
        setRouteData(null);
      }
    };

    fetchOsrmRoute(routeStart, routeEnd);
  }, [routeStart, routeEnd, osrmBaseUrl]);

  const MapEvents = () => {
    useMapEvents({
      click(e) {
        const { lat, lng } = e.latlng;
        if (!routeStart || (routeStart && routeEnd)) {
          setRouteStart({ lat, lng });
          setRouteEnd(null);
          setRouteData(null);
        } else if (routeStart && !routeEnd) {
          setRouteEnd({ lat, lng });
        }
      },
    });
    return null;
  };

  const geocodeWithGeoapify = async (query) => {
    if (!geoapifyKey.trim()) {
      return { error: 'Geoapify API key is required' };
    }

    const endpoint = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(
      query
    )}&limit=1&filter=countrycode:vn&bias=countrycode:vn&apiKey=${encodeURIComponent(geoapifyKey.trim())}`;

    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`Geoapify request failed (${response.status})`);
    }

    const data = await response.json();
    const feature = data?.features?.[0];
    if (!feature?.geometry?.coordinates) {
      return { error: 'No result' };
    }

    return {
      lat: feature.geometry.coordinates[1],
      lng: feature.geometry.coordinates[0],
      address: feature.properties?.formatted || 'Unknown address',
    };
  };

  const geocodeWithGoong = async (query) => {
    if (!goongKey.trim()) {
      return { error: 'Goong API key is required' };
    }

    const endpoint = `https://rsapi.goong.io/geocode?address=${encodeURIComponent(
      query
    )}&api_key=${encodeURIComponent(goongKey.trim())}`;

    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`Goong request failed (${response.status})`);
    }

    const data = await response.json();
    const result = data?.results?.[0];
    const location = result?.geometry?.location;
    if (!location) {
      return { error: 'No result' };
    }

    return {
      lat: location.lat,
      lng: location.lng,
      address: result.formatted_address || 'Unknown address',
    };
  };

  const geocodeWithSelfHost = async (query) => {
    const baseUrl = normalizeBaseUrl(selfHostBaseUrl);
    if (!baseUrl) {
      return { error: 'Self-host base URL is required' };
    }

    if (selfHostType === 'nominatim') {
      const endpoint = `${baseUrl}/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
      const response = await fetch(endpoint, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Nominatim request failed (${response.status})`);
      }

      const data = await response.json();
      const result = data?.[0];
      if (!result) {
        return { error: 'No result' };
      }

      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        address: result.display_name || 'Unknown address',
      };
    }

    const endpoint = `${baseUrl}/api/?q=${encodeURIComponent(query)}&limit=1`;
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`Photon request failed (${response.status})`);
    }

    const data = await response.json();
    const feature = data?.features?.[0];
    const coordinates = feature?.geometry?.coordinates;
    if (!coordinates) {
      return { error: 'No result' };
    }

    return {
      lat: coordinates[1],
      lng: coordinates[0],
      address: feature.properties?.name || feature.properties?.street || 'Unknown address',
    };
  };

  const geocodeWithOpenCage = async (query) => {
    if (!openCageKey.trim()) {
      return { error: 'OpenCage API key is required' };
    }

    const endpoint = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(
      query
    )}&key=${encodeURIComponent(openCageKey.trim())}&limit=1&countrycode=vn`;

    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`OpenCage request failed (${response.status})`);
    }

    const data = await response.json();
    const result = data?.results?.[0];
    const geometry = result?.geometry;
    if (!geometry) {
      return { error: 'No result' };
    }

    return {
      lat: geometry.lat,
      lng: geometry.lng,
      address: result.formatted || 'Unknown address',
    };
  };

  const geocodeWithLocationIq = async (query) => {
    if (!locationIqKey.trim()) {
      return { error: 'LocationIQ API key is required' };
    }

    const endpoint = `https://us1.locationiq.com/v1/search?key=${encodeURIComponent(
      locationIqKey.trim()
    )}&q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=vn`;

    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`LocationIQ request failed (${response.status})`);
    }

    const data = await response.json();
    const result = data?.[0];
    if (!result) {
      return { error: 'No result' };
    }

    return {
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      address: result.display_name || 'Unknown address',
    };
  };

  const geocodeWithMapbox = async (query) => {
    if (!mapboxKey.trim()) {
      return { error: 'Mapbox API key is required' };
    }

    const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      query
    )}.json?access_token=${encodeURIComponent(mapboxKey.trim())}&limit=1&country=vn`;

    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`Mapbox request failed (${response.status})`);
    }

    const data = await response.json();
    const feature = data?.features?.[0];
    const center = feature?.center;
    if (!center) {
      return { error: 'No result' };
    }

    return {
      lat: center[1],
      lng: center[0],
      address: feature.place_name || 'Unknown address',
    };
  };

  const handleCompare = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      return;
    }

    setLoading(true);
    const query = searchQuery.trim();

    const providers = [
      { key: 'geoapify', run: () => geocodeWithGeoapify(query) },
      { key: 'goong', run: () => geocodeWithGoong(query) },
      { key: 'opencage', run: () => geocodeWithOpenCage(query) },
      { key: 'locationiq', run: () => geocodeWithLocationIq(query) },
      { key: 'mapbox', run: () => geocodeWithMapbox(query) },
      { key: 'selfHost', run: () => geocodeWithSelfHost(query) },
    ];

    const settled = await Promise.all(
      providers.map(async (provider) => {
        try {
          const result = await provider.run();
          if (result.error) {
            return [provider.key, { status: 'error', message: result.error }];
          }
          return [provider.key, { status: 'ok', ...result }];
        } catch (error) {
          return [
            provider.key,
            {
              status: 'error',
              message: error?.message || 'Request failed',
            },
          ];
        }
      })
    );

    const nextResults = Object.fromEntries(settled);
    setProviderResults(nextResults);
    setLoading(false);

    const validPoints = Object.values(nextResults).filter((item) => item.status === 'ok');
    if (validPoints.length > 0 && mapRef.current) {
      const bounds = L.latLngBounds(validPoints.map((item) => [item.lat, item.lng]));
      mapRef.current.fitBounds(bounds, { padding: [40, 40] });
    }
  };

  const clearResults = () => {
    setProviderResults({});
  };

  const resultKeys = ['geoapify', 'goong', 'opencage', 'locationiq', 'mapbox', 'selfHost'];
  const markerItems = resultKeys
    .map((providerKey) => ({ providerKey, result: providerResults[providerKey] }))
    .filter(({ result }) => result?.status === 'ok');

  return (
    <div className="App">
      <div className="sidebar">
        <h1>Geocoding Comparison</h1>
        <p className="subtitle">Compare provider accuracy for the same query in Vietnam.</p>

        <form className="search-box" onSubmit={handleCompare}>
          <h3>Address Query</h3>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Example: 45 Lê Lợi, Quận 1, Hồ Chí Minh"
            className="search-input"
          />
          <button type="submit" className="search-btn" disabled={loading}>
            {loading ? 'Comparing...' : 'Compare Providers'}
          </button>
        </form>

        <div className="provider-config">
          <h3>Provider Setup</h3>
          <label>
            Geoapify API Key
            <input
              type="password"
              value={geoapifyKey}
              onChange={(e) => setGeoapifyKey(e.target.value)}
              placeholder="Required for Geoapify"
              className="search-input"
            />
          </label>

          <label>
            Goong API Key
            <input
              type="password"
              value={goongKey}
              onChange={(e) => setGoongKey(e.target.value)}
              placeholder="Required for Goong"
              className="search-input"
            />
          </label>

          <label>
            OpenCage API Key
            <input
              type="password"
              value={openCageKey}
              onChange={(e) => setOpenCageKey(e.target.value)}
              placeholder="Required for OpenCage"
              className="search-input"
            />
          </label>

          <label>
            LocationIQ API Key
            <input
              type="password"
              value={locationIqKey}
              onChange={(e) => setLocationIqKey(e.target.value)}
              placeholder="Required for LocationIQ"
              className="search-input"
            />
          </label>

          <label>
            Mapbox API Key
            <input
              type="password"
              value={mapboxKey}
              onChange={(e) => setMapboxKey(e.target.value)}
              placeholder="Required for Mapbox"
              className="search-input"
            />
          </label>

          <label>
            Self-host Engine
            <select
              value={selfHostType}
              onChange={(e) => setSelfHostType(e.target.value)}
              className="search-input"
            >
              <option value="nominatim">Nominatim</option>
              <option value="photon">Photon</option>
            </select>
          </label>

          <label>
            Self-host Base URL
            <input
              type="text"
              value={selfHostBaseUrl}
              onChange={(e) => setSelfHostBaseUrl(e.target.value)}
              placeholder="Example: http://localhost:2322"
              className="search-input"
            />
          </label>
        </div>

        <div className="provider-config">
          <h3>OSRM Routing</h3>
          <p className="subtitle" style={{ marginBottom: '10px' }}>Click on the map to set Start and End points.</p>
          <label>
            OSRM Base URL
            <input
              type="text"
              value={osrmBaseUrl}
              onChange={(e) => setOsrmBaseUrl(e.target.value)}
              placeholder="https://router.project-osrm.org"
              className="search-input"
            />
          </label>
          <div className="result-card" style={{ marginTop: '10px' }}>
            <strong>Start Point:</strong> {routeStart ? `${routeStart.lat.toFixed(6)}, ${routeStart.lng.toFixed(6)}` : 'Not set'}
            <br />
            <strong>End Point:</strong> {routeEnd ? `${routeEnd.lat.toFixed(6)}, ${routeEnd.lng.toFixed(6)}` : 'Not set'}
          </div>
          <button
            onClick={() => {
              setRouteStart(null);
              setRouteEnd(null);
              setRouteData(null);
            }}
            className="clear-btn"
            type="button"
          >
            Clear Route
          </button>
          {routeStart && routeEnd && (
            <button
              onClick={() => {
                const url = `https://www.google.com/maps/dir/?api=1&origin=${routeStart.lat},${routeStart.lng}&destination=${routeEnd.lat},${routeEnd.lng}&travelmode=driving`;
                window.open(url, '_blank', 'noopener,noreferrer');
              }}
              className="google-nav-btn"
              type="button"
            >
              Navigate via Google Maps
            </button>
          )}
        </div>

        <div className="results-panel">
          <h3>Provider Results</h3>
          {resultKeys.map((providerKey) => {
            const result = providerResults[providerKey];
            const config = providerConfigs[providerKey];

            return (
              <div key={providerKey} className="result-card">
                <strong>{config.label}</strong>
                {!result && <p className="muted">No result yet</p>}
                {result?.status === 'ok' && (
                  <>
                    <p>{result.address}</p>
                    <p className="coords">
                      {result.lat.toFixed(6)}, {result.lng.toFixed(6)}
                    </p>
                  </>
                )}
                {result?.status === 'error' && <p className="error">{result.message}</p>}
              </div>
            );
          })}
          <button onClick={clearResults} className="clear-btn" type="button">
            Clear Markers
          </button>
        </div>

        <div className="legend">
          <h4>Marker Legend</h4>
          <p>
            <span className="dot dot-blue" /> Geoapify
          </p>
          <p>
            <span className="dot dot-green" /> Goong
          </p>
          <p>
            <span className="dot dot-orange" /> OpenCage
          </p>
          <p>
            <span className="dot dot-violet" /> LocationIQ
          </p>
          <p>
            <span className="dot dot-black" /> Mapbox
          </p>
          <p>
            <span className="dot dot-red" /> Self-host
          </p>
        </div>
      </div>

      <div className="map-container">
        <MapContainer center={[10.8231, 106.6297]} zoom={13} ref={mapRef} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapEvents />
          {markerItems.map(({ providerKey, result }) => (
            <Marker key={providerKey} position={[result.lat, result.lng]} icon={providerIcons[providerKey]}>
              <Popup>
                <strong>{providerConfigs[providerKey].label}</strong>
                <br />
                {result.address}
                <br />
                {result.lat.toFixed(6)}, {result.lng.toFixed(6)}
              </Popup>
            </Marker>
          ))}
          {routeStart && (
            <Marker position={[routeStart.lat, routeStart.lng]}>
              <Popup>Start Point</Popup>
            </Marker>
          )}
          {routeEnd && (
            <Marker position={[routeEnd.lat, routeEnd.lng]}>
              <Popup>End Point</Popup>
            </Marker>
          )}
          {routeData && (
            <GeoJSON
              data={routeData}
              style={{ color: '#3388ff', weight: 6, opacity: 0.8 }}
              key={JSON.stringify(routeData)}
            />
          )}
        </MapContainer>
      </div>
    </div>
  );
}

export default App;
