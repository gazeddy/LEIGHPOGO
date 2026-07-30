import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";

export interface MapGym {
  id: string;
  name: string;
  alias: string | null;
  url: string | null;
  lat: number;
  lon: number;
  exRaidEligible: boolean;
  firstSeenAt: string | null;
}

interface GymMapProps {
  gyms: MapGym[];
  importedAt: string | null;
}

interface UserLocation {
  lat: number;
  lon: number;
}

const NEW_GYM_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function displayName(gym: MapGym): string {
  return gym.alias || gym.name;
}

function newGymOpacity(gym: MapGym): number {
  if (!gym.firstSeenAt) {
    return 0;
  }

  const age = Date.now() - Date.parse(gym.firstSeenAt);

  if (!Number.isFinite(age) || age < 0 || age >= NEW_GYM_WINDOW_MS) {
    return 0;
  }

  return Math.max(0, Math.min(1, 1 - age / NEW_GYM_WINDOW_MS));
}

function distanceKm(from: UserLocation, gym: MapGym): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latDifference = toRadians(gym.lat - from.lat);
  const lonDifference = toRadians(gym.lon - from.lon);
  const fromLat = toRadians(from.lat);
  const gymLat = toRadians(gym.lat);
  const a =
    Math.sin(latDifference / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(gymLat) * Math.sin(lonDifference / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function MapController({
  gyms,
  selectedGym,
  userLocation,
}: {
  gyms: MapGym[];
  selectedGym: MapGym | null;
  userLocation: UserLocation | null;
}) {
  const map = useMap();

  useMemo(() => {
    if (selectedGym) {
      map.flyTo([selectedGym.lat, selectedGym.lon], 17, { duration: 0.7 });
      return;
    }

    if (userLocation) {
      map.flyTo([userLocation.lat, userLocation.lon], 14, { duration: 0.7 });
      return;
    }

    if (gyms.length > 0) {
      const bounds = gyms.map((gym) => [gym.lat, gym.lon]) as LatLngBoundsExpression;
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
    }
  }, [gyms, map, selectedGym, userLocation]);

  return null;
}

export default function GymMap({ gyms, importedAt }: GymMapProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const selectedId = typeof router.query.gym === "string" ? router.query.gym : null;
  const selectedGym = gyms.find((gym) => gym.id === selectedId) || null;

  const filteredGyms = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matching = term
      ? gyms.filter((gym) =>
          [gym.name, gym.alias || ""].some((value) => value.toLowerCase().includes(term)),
        )
      : gyms;

    return [...matching].sort((left, right) => {
      if (userLocation) {
        return distanceKm(userLocation, left) - distanceKm(userLocation, right);
      }

      return displayName(left).localeCompare(displayName(right), "en-GB");
    });
  }, [gyms, search, userLocation]);

  function selectGym(gym: MapGym) {
    void router.replace(
      { pathname: "/gyms", query: { gym: gym.id } },
      undefined,
      { shallow: true, scroll: false },
    );
  }

  function locateUser() {
    setLocationError(null);

    if (!navigator.geolocation) {
      setLocationError("Location is not supported by this browser.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
        setLocating(false);
      },
      (error) => {
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was not granted."
            : "Your location could not be determined.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  if (gyms.length === 0) {
    return (
      <section className="gym-empty">
        <h2>No gym data has been uploaded</h2>
        <p>An administrator needs to upload the current gym CSV before the map is available.</p>
      </section>
    );
  }

  return (
    <div className="gym-map-layout">
      <aside className="gym-map-sidebar">
        <div className="gym-map-controls">
          <label>
            Search gyms
            <input
              type="search"
              value={search}
              placeholder="Official name or community alias"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="location-actions">
            <button type="button" onClick={locateUser} disabled={locating}>
              {locating ? "Finding…" : userLocation ? "Update my location" : "Gyms near me"}
            </button>
            {userLocation && (
              <button type="button" className="secondary" onClick={() => setUserLocation(null)}>
                Clear location
              </button>
            )}
          </div>
          {locationError && <p className="gym-error">{locationError}</p>}
          <p className="gym-count">
            {filteredGyms.length} of {gyms.length} gyms
            {importedAt && (
              <small>Updated {new Date(importedAt).toLocaleString("en-GB")}</small>
            )}
          </p>
        </div>

        <div className="gym-results" aria-label="Gym results">
          {filteredGyms.slice(0, 100).map((gym) => {
            const opacity = newGymOpacity(gym);
            return (
              <button
                key={gym.id}
                type="button"
                className={selectedId === gym.id ? "selected" : ""}
                onClick={() => selectGym(gym)}
              >
                <span>
                  <strong>{displayName(gym)}</strong>
                  {gym.alias && <small>{gym.name}</small>}
                </span>
                <span className="gym-result-meta">
                  {opacity > 0 && <em>New</em>}
                  {userLocation && <small>{distanceKm(userLocation, gym).toFixed(1)} km</small>}
                </span>
              </button>
            );
          })}
          {filteredGyms.length > 100 && (
            <p className="result-limit">Refine the search to see results beyond the first 100.</p>
          )}
        </div>
      </aside>

      <div className="gym-map-panel">
        <MapContainer center={[53.49, -2.52]} zoom={12} scrollWheelZoom className="gym-leaflet-map">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapController
            gyms={filteredGyms}
            selectedGym={selectedGym}
            userLocation={userLocation}
          />

          {userLocation && (
            <CircleMarker
              center={[userLocation.lat, userLocation.lon]}
              radius={8}
              pathOptions={{ color: "#58a6ff", fillColor: "#58a6ff", fillOpacity: 0.75, weight: 3 }}
            >
              <Popup>Your current location</Popup>
            </CircleMarker>
          )}

          {filteredGyms.map((gym) => {
            const opacity = newGymOpacity(gym);
            const selected = selectedId === gym.id;

            return (
              <span key={gym.id}>
                {opacity > 0 && (
                  <CircleMarker
                    center={[gym.lat, gym.lon]}
                    radius={18 + opacity * 7}
                    interactive={false}
                    pathOptions={{
                      className: "new-gym-aura",
                      color: "#f2cc60",
                      fillColor: "#f2cc60",
                      opacity: 0.2 + opacity * 0.65,
                      fillOpacity: 0.05 + opacity * 0.2,
                      weight: 3,
                    }}
                  />
                )}
                <CircleMarker
                  center={[gym.lat, gym.lon]}
                  radius={selected ? 10 : 7}
                  eventHandlers={{ click: () => selectGym(gym) }}
                  pathOptions={{
                    color: selected ? "#ffffff" : gym.exRaidEligible ? "#a371f7" : "#2ea043",
                    fillColor: gym.exRaidEligible ? "#8957e5" : "#238636",
                    fillOpacity: 0.92,
                    weight: selected ? 4 : 2,
                  }}
                >
                  <Popup>
                    <div className="gym-popup">
                      <strong>{displayName(gym)}</strong>
                      {gym.alias && <small>Official name: {gym.name}</small>}
                      {opacity > 0 && <span className="new-badge">New gym</span>}
                      {gym.exRaidEligible && <span>EX raid eligible</span>}
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${gym.lat},${gym.lon}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Directions in Google Maps
                      </a>
                    </div>
                  </Popup>
                </CircleMarker>
              </span>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
