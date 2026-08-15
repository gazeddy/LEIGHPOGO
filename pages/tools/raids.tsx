import Head from "next/head";
import type { GetServerSideProps } from "next";
import { getRaidToolsData } from "../../lib/raid-boss-history";
import type {
  RaidBossProfileData,
  RaidCategoryData,
  RaidRotationData,
  RaidToolsData,
  RaidTypeMatchup,
} from "../../lib/events";
import styles from "../../styles/RaidTools.module.css";

function formatDateTime(value: string): string {
  const includesTimeZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  const date = new Date(includesTimeZone ? value : `${value}Z`);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: includesTimeZone ? "Europe/London" : "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateRange(start: string, end: string): string {
  return `${formatDateTime(start)} – ${formatDateTime(end)}`;
}

function formatMultiplier(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return `${rounded}×`;
}

function MatchupList({
  title,
  items,
  emphasis = false,
}: {
  title: string;
  items: RaidTypeMatchup[];
  emphasis?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className={styles.matchupGroup}>
      <h4>{title}</h4>
      <div className={styles.chips}>
        {items.map((item) => (
          <span
            key={`${title}-${item.type}`}
            className={`${styles.chip} ${emphasis ? styles.emphasisChip : ""}`}
          >
            {item.type} <strong>{formatMultiplier(item.multiplier)}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function BossDetails({ boss }: { boss: RaidBossProfileData }) {
  const doubleWeaknesses = boss.weaknesses.filter((item) => item.multiplier > 1.61);
  const weaknesses = boss.weaknesses.filter((item) => item.multiplier <= 1.61);
  const heavyResists = boss.resistances.filter((item) => item.multiplier < 0.624);
  const resistances = boss.resistances.filter((item) => item.multiplier >= 0.624);

  return (
    <section className={styles.bossDetails} aria-label={`${boss.name} raid information`}>
      <div className={styles.bossHeading}>
        <div>
          <h3>{boss.name}</h3>
          {boss.types.length > 0 && (
            <p className={styles.types}>{boss.types.join(" / ")}</p>
          )}
        </div>
        {boss.possibleShiny === true && (
          <span className={styles.shiny} title="Shiny available">✨ Shiny</span>
        )}
      </div>

      <div className={styles.cpGrid}>
        <div>
          <span>100% IV CP</span>
          <strong>{boss.maxUnboostedCp?.toLocaleString("en-GB") ?? "—"}</strong>
          <small>Level 20</small>
        </div>
        <div>
          <span>Weather boosted</span>
          <strong>{boss.maxBoostedCp?.toLocaleString("en-GB") ?? "—"}</strong>
          <small>Level 25</small>
        </div>
      </div>

      {boss.boostedWeather.length > 0 && (
        <p className={styles.weather}>
          <strong>Catch boost:</strong> {boss.boostedWeather.join(", ")}
        </p>
      )}

      <div className={styles.matchups}>
        <MatchupList title="Double weakness" items={doubleWeaknesses} emphasis />
        <MatchupList title="Weak to" items={weaknesses} />
        <MatchupList title="Strong resistance" items={heavyResists} />
        <MatchupList title="Resists" items={resistances} />
      </div>
    </section>
  );
}

function RotationCard({ rotation }: { rotation: RaidRotationData }) {
  return (
    <article
      id={rotation.anchor}
      className={`${styles.rotationCard} ${rotation.active ? styles.activeCard : ""}`}
    >
      <header className={styles.rotationHeader}>
        <div>
          <div className={styles.statusLine}>
            {rotation.active && <span className={styles.currentBadge}>Current</span>}
            {!rotation.active && <span className={styles.historyBadge}>Previous</span>}
          </div>
          <h2>{rotation.boss}</h2>
          <p>{formatDateRange(rotation.start, rotation.end)}</p>
        </div>
      </header>

      {rotation.bosses.length > 0 ? (
        <div className={styles.bossList}>
          {rotation.bosses.map((boss) => (
            <BossDetails key={boss.key} boss={boss} />
          ))}
        </div>
      ) : (
        <p className={styles.missingDetails}>
          Detailed raid data was not cached for this rotation.
        </p>
      )}
    </article>
  );
}

function RaidColumn({ data }: { data: RaidCategoryData }) {
  return (
    <section id={`raid-${data.category}`} className={styles.column}>
      <header className={styles.columnHeader}>
        <p>Raid history</p>
        <h2>{data.label}</h2>
      </header>

      {data.next && (
        <aside className={styles.nextNotice} aria-label={`Next ${data.label} raid boss`}>
          <span>Next</span>
          <strong>{data.next.boss}</strong>
          <small>from {formatDateTime(data.next.start)}</small>
        </aside>
      )}

      <div className={styles.rotations}>
        {data.rotations.length > 0 ? (
          data.rotations.map((rotation) => (
            <RotationCard key={rotation.eventID} rotation={rotation} />
          ))
        ) : (
          <p className={styles.empty}>No raid rotations have been stored yet.</p>
        )}
      </div>
    </section>
  );
}

export default function RaidToolsPage({ data }: { data: RaidToolsData }) {
  return (
    <>
      <Head>
        <title>Raid Bosses | Leigh Pokémon Go Community</title>
        <meta
          name="description"
          content="Current and recent five-star, Shadow five-star and Mega raid bosses with weaknesses and perfect-IV catch CPs."
        />
      </Head>
      <main className={`container ${styles.page}`}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>Tools · Raids</p>
          <h1>Raid bosses</h1>
          <p>
            Current and recent raid rotations. Upcoming bosses only appear during the final 24 hours before their rotation begins; their detailed card stays hidden until they are active.
          </p>
          {data.warning && <p className={styles.warning}>{data.warning}</p>}
        </header>

        <div className={styles.columns}>
          {data.categories.map((category) => (
            <RaidColumn key={category.category} data={category} />
          ))}
        </div>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<{ data: RaidToolsData }> = async () => {
  const data = await getRaidToolsData();
  return { props: { data } };
};
