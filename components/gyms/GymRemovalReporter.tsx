import { useRouter } from "next/router";
import ReportGymRemovedButton from "./ReportGymRemovedButton";
import styles from "./GymRemovalReporter.module.css";

interface ReportableGym {
  id: string;
  name: string;
  alias: string | null;
}

interface GymRemovalReporterProps {
  gyms: ReportableGym[];
}

export default function GymRemovalReporter({ gyms }: GymRemovalReporterProps) {
  const router = useRouter();
  const selectedId =
    typeof router.query.gym === "string" ? router.query.gym : null;
  const selectedGym = gyms.find((gym) => gym.id === selectedId) || null;

  return (
    <section className={styles.panel} aria-label="Report a removed gym">
      <div>
        <strong>Has a gym been removed?</strong>
        {selectedGym ? (
          <p>
            Report <b>{selectedGym.alias || selectedGym.name}</b> for administrator
            review. It will stay on the map until an admin approves removal.
          </p>
        ) : (
          <p>Select a gym on the map or from the visible gym list first.</p>
        )}
      </div>
      {selectedGym && (
        <ReportGymRemovedButton
          key={selectedGym.id}
          gymId={selectedGym.id}
          gymName={selectedGym.alias || selectedGym.name}
        />
      )}
    </section>
  );
}
