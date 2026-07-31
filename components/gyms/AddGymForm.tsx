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

type CreateGymResponse =
  | { message: string; gym: CreatedGym }
  | { error: string };

function geolocationErrorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return "Location access is blocked for this site. Open your browser's site permissions, change Location to Allow, then press Try location again.";
  }

  if (error.code === error.POSITION_UNAVAILABLE) {
    return "Your device could not provide a GPS position. Make sure device Location is switched on, then try again.";
  }

  if (error.code === error.TIMEOUT) {
    return "The GPS request timed out before your device found a position. Move somewhere with a clearer signal and try again.";
  }

  return "Your current GPS location could not be determined. Please try again.";
}

export default function AddGymForm() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState<CapturedLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  function requestLocation() {
    setLocationError(null);
    setSubmitError(null);

    if (!window.isSecureContext) {
      setLocationError(
        "Your browser blocks GPS on non-secure pages. Open the HTTPS version of this site, then try again.",
      );
      return;
    }

    if (!navigator.geolocation) {
      setLocationError("Location is not supported by this browser or device.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setLocating(false);
      },
      (error) => {
        setLocation(null);
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
    setLocation(null);
    setLocationError(null);
    setSubmitError(null);
    requestLocation();
  }

  function cancel() {
    setOpen(false);
    setTitle("");
    setLocation(null);
    setLocationError(null);
    setSubmitError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    const cleanedTitle = title.trim();

    if (!cleanedTitle) {
      setSubmitError("Enter a title for the gym.");
      return;
    }

    if (!location) {
      setSubmitError("A current GPS location is required before the gym can be added.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/gyms/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: cleanedTitle,
          lat: location.lat,
          lon: location.lon,
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
    <section className={styles.panel} aria-label="Add a gym">
      {!open ? (
        <div className={styles.launch}>
          <div className={styles.launchCopy}>
            <strong>Missing a gym?</strong>
            <span>Add it using your device's current GPS position.</span>
          </div>
          <button type="button" className={styles.primary} onClick={startAdding}>
            Add a gym at my location
          </button>
        </div>
      ) : (
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.formHeader}>
            <div>
              <h2>Add a gym</h2>
              <p>The saved marker will use the GPS position reported by this device.</p>
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

          {location ? (
            <div className={styles.locationStatus}>
              <strong>GPS location captured</strong>
              <span>
                {location.lat.toFixed(6)}, {location.lon.toFixed(6)}
              </span>
              <small>Reported accuracy: about {Math.round(location.accuracy)} metres</small>
            </div>
          ) : (
            <p className={styles.help}>
              {locating
                ? "Requesting your current GPS location…"
                : "A current GPS location is required."}
            </p>
          )}

          {locationError && <p className={styles.error}>{locationError}</p>}
          {submitError && <p className={styles.error}>{submitError}</p>}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={requestLocation}
              disabled={locating || saving}
            >
              {locating
                ? "Finding location…"
                : location
                  ? "Refresh GPS location"
                  : "Try location again"}
            </button>
            <button
              type="submit"
              className={styles.primary}
              disabled={locating || saving || !location}
            >
              {saving ? "Adding gym…" : "Add gym"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
