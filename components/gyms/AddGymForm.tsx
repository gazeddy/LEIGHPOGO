import { useState, type FormEvent } from "react";
import styles from "./AddGymForm.module.css";

interface CapturedLocation {
  lat: number;
  lon: number;
  accuracy: number;
}

interface CreatedGym {
  id: string;
}

interface AddGymFormProps {
  initialOpen?: boolean;
}

type LocationMode = "gps" | "manual";

type CreateGymResponse =
  | { message: string; gym: CreatedGym }
  | { error: string };

function geolocationErrorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return "Location access is blocked for this site. Open your browser's site permissions, change Location to Allow, then press Try location again. You can also set the location manually.";
  }

  if (error.code === error.POSITION_UNAVAILABLE) {
    return "Your device could not provide a GPS position. Make sure device Location is switched on, then try again, or set the location manually.";
  }

  if (error.code === error.TIMEOUT) {
    return "The GPS request timed out before your device found a position. Move somewhere with a clearer signal and try again, or set the location manually.";
  }

  return "Your current GPS location could not be determined. Try again or set the location manually.";
}

function manualCoordinate(
  value: string,
  field: "latitude" | "longitude",
): number {
  const coordinate = Number(value.trim());
  const minimum = field === "latitude" ? -90 : -180;
  const maximum = field === "latitude" ? 90 : 180;

  if (!Number.isFinite(coordinate) || coordinate < minimum || coordinate > maximum) {
    throw new Error(
      `Enter a valid ${field} between ${minimum} and ${maximum}.`,
    );
  }

  return coordinate;
}

export default function AddGymForm({ initialOpen = false }: AddGymFormProps) {
  const [open, setOpen] = useState(initialOpen);
  const [title, setTitle] = useState("");
  const [locationMode, setLocationMode] = useState<LocationMode>("gps");
  const [gpsLocation, setGpsLocation] = useState<CapturedLocation | null>(null);
  const [manualLatitude, setManualLatitude] = useState("");
  const [manualLongitude, setManualLongitude] = useState("");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  function requestLocation() {
    setLocationError(null);
    setSubmitError(null);

    if (!window.isSecureContext) {
      setLocationError(
        "Your browser blocks GPS on non-secure pages. Open the HTTPS version of this site and try again, or set the location manually.",
      );
      return;
    }

    if (!navigator.geolocation) {
      setLocationError(
        "Location is not supported by this browser or device. Set the location manually instead.",
      );
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setLocating(false);
      },
      (error) => {
        setGpsLocation(null);
        setLocationError(geolocationErrorMessage(error));
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 0,
      },
    );
  }

  function startAdding() {
    setOpen(true);
    setLocationMode("gps");
    setGpsLocation(null);
    setManualLatitude("");
    setManualLongitude("");
    setLocationError(null);
    setSubmitError(null);
    requestLocation();
  }

  function chooseGps() {
    setLocationMode("gps");
    setSubmitError(null);
    requestLocation();
  }

  function chooseManual() {
    setLocationMode("manual");
    setLocationError(null);
    setSubmitError(null);
  }

  function cancel() {
    setOpen(false);
    setTitle("");
    setLocationMode("gps");
    setGpsLocation(null);
    setManualLatitude("");
    setManualLongitude("");
    setLocationError(null);
    setSubmitError(null);
    setLocating(false);
    setSaving(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    const cleanedTitle = title.trim();

    if (!cleanedTitle) {
      setSubmitError("Enter a title for the gym.");
      return;
    }

    let lat: number;
    let lon: number;

    try {
      if (locationMode === "manual") {
        lat = manualCoordinate(manualLatitude, "latitude");
        lon = manualCoordinate(manualLongitude, "longitude");
      } else if (gpsLocation) {
        lat = gpsLocation.lat;
        lon = gpsLocation.lon;
      } else {
        setSubmitError(
          "Capture a GPS location or choose Set location manually.",
        );
        return;
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Enter valid coordinates.",
      );
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/gyms/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: cleanedTitle,
          lat,
          lon,
        }),
      });
      const data = (await response.json()) as CreateGymResponse;

      if (!response.ok || !("gym" in data)) {
        throw new Error("error" in data ? data.error : "The gym could not be added.");
      }

      window.location.assign(`/gyms?gym=${encodeURIComponent(data.gym.id)}`);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "The gym could not be added.",
      );
      setSaving(false);
    }
  }

  return (
    <section id="add-gym" className={styles.panel} aria-label="Add a gym">
      {!open ? (
        <div className={styles.launch}>
          <div className={styles.launchCopy}>
            <strong>Missing a gym?</strong>
            <span>Use your device GPS or enter its coordinates manually.</span>
          </div>
          <button type="button" className={styles.primary} onClick={startAdding}>
            Add a gym
          </button>
        </div>
      ) : (
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.formHeader}>
            <div>
              <h2>Add a gym</h2>
              <p>Choose device GPS or enter the marker coordinates manually.</p>
            </div>
            <button
              type="button"
              className={styles.secondary}
              onClick={cancel}
              disabled={saving}
            >
              Cancel
            </button>
          </div>

          <label className={styles.field}>
            Gym title
            <input
              type="text"
              value={title}
              maxLength={120}
              placeholder="For example, Leigh Cenotaph"
              autoComplete="off"
              required
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <div className={styles.locationMethods} role="group" aria-label="Location method">
            <button
              type="button"
              className={`${styles.methodButton} ${locationMode === "gps" ? styles.methodActive : ""}`}
              onClick={chooseGps}
              disabled={saving || (locationMode === "gps" && locating)}
            >
              Use device GPS
            </button>
            <button
              type="button"
              className={`${styles.methodButton} ${locationMode === "manual" ? styles.methodActive : ""}`}
              onClick={chooseManual}
              disabled={saving}
            >
              Set location manually
            </button>
          </div>

          {locationMode === "gps" ? (
            <>
              {gpsLocation ? (
                <div className={styles.locationStatus}>
                  <strong>GPS location captured</strong>
                  <span>
                    {gpsLocation.lat.toFixed(6)}, {gpsLocation.lon.toFixed(6)}
                  </span>
                  <small>
                    Reported accuracy: about {Math.round(gpsLocation.accuracy)} metres
                  </small>
                </div>
              ) : (
                <p className={styles.help}>
                  {locating
                    ? "Requesting your current GPS location…"
                    : "A GPS location has not been captured."}
                </p>
              )}

              {locationError && <p className={styles.error}>{locationError}</p>}

              <button
                type="button"
                className={styles.secondary}
                onClick={requestLocation}
                disabled={locating || saving}
              >
                {locating
                  ? "Finding location…"
                  : gpsLocation
                    ? "Refresh GPS location"
                    : "Use current location"}
              </button>
            </>
          ) : (
            <div className={styles.manualLocation}>
              <p className={styles.help}>
                Enter decimal coordinates. In Google Maps, press and hold the gym location to drop a pin and copy its latitude and longitude.
              </p>
              <div className={styles.coordinateGrid}>
                <label className={styles.field}>
                  Latitude
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="-90"
                    max="90"
                    value={manualLatitude}
                    placeholder="53.496000"
                    required={locationMode === "manual"}
                    onChange={(event) => setManualLatitude(event.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  Longitude
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="-180"
                    max="180"
                    value={manualLongitude}
                    placeholder="-2.519000"
                    required={locationMode === "manual"}
                    onChange={(event) => setManualLongitude(event.target.value)}
                  />
                </label>
              </div>
            </div>
          )}

          {submitError && <p className={styles.error}>{submitError}</p>}

          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.primary}
              disabled={
                saving ||
                (locationMode === "gps" && (locating || !gpsLocation))
              }
            >
              {saving ? "Adding gym…" : "Add gym"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
