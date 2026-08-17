import dynamic from "next/dynamic";
import Head from "next/head";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import AddGymForm from "../components/gyms/AddGymForm";
import GymRemovalReporter from "../components/gyms/GymRemovalReporter";
import { readGymState, sortGyms } from "../lib/gyms";
import { recordUsageEvent } from "../lib/usageEvents";
import { authOptions } from "./api/auth/[...nextauth]";

const GymMap = dynamic(() => import("../components/gyms/GymMap"), {
  ssr: false,
  loading: () => <p className="gym-map-loading">Loading gym map…</p>,
});

interface GymPageProps {
  gyms: Awaited<ReturnType<typeof readGymState>>["gyms"];
  importedAt: string | null;
  showAddGym: boolean;
}

export const getServerSideProps: GetServerSideProps<GymPageProps> = async (
  context,
) => {
  const session = await getServerSession(
    context.req,
    context.res,
    authOptions as NextAuthOptions,
  );

  if (!session) {
    const callbackUrl = encodeURIComponent(context.resolvedUrl || "/gyms");
    return {
      redirect: {
        destination: `/login?callbackUrl=${callbackUrl}`,
        permanent: false,
      },
    };
  }

  const userId = Number(
    (session as { user?: { id?: string | number } }).user?.id,
  );

  if (Number.isInteger(userId)) {
    await recordUsageEvent({
      type: "GYM_MAP_OPENED",
      ownerId: userId,
      path: "/gyms",
      userAgent: context.req.headers["user-agent"],
    });
  }

  const state = await readGymState();
  const addGymQuery = Array.isArray(context.query.add)
    ? context.query.add[0]
    : context.query.add;

  return {
    props: {
      gyms: sortGyms(state.gyms),
      importedAt: state.importedAt,
      showAddGym: addGymQuery === "1" || addGymQuery === "true",
    },
  };
};

export default function GymsPage({
  gyms,
  importedAt,
  showAddGym,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <>
      <Head>
        <title>Gym Map | Leigh Pokémon Go Community</title>
        <meta
          name="description"
          content="Private community map of Pokémon GO gyms around Leigh and the surrounding area."
        />
      </Head>
      <main className="container gyms-page">
        <header className="gyms-header">
          <div>
            <p className="eyebrow">Members only</p>
            <h1>Community gym map</h1>
            <p>
              Search official names and community aliases, find the nearest gyms,
              add missing gyms, report removed gyms for admin review, and open
              turn-by-turn directions in Google Maps.
            </p>
          </div>
          <div className="gym-legend" aria-label="Map legend">
            <span><i className="standard" /> Gym</span>
            <span><i className="ex" /> EX eligible</span>
            <span><i className="new" /> Added in the last week</span>
          </div>
        </header>
        <AddGymForm initialOpen={showAddGym} />
        <GymRemovalReporter gyms={gyms} />
        <GymMap gyms={gyms} importedAt={importedAt} />
      </main>
    </>
  );
}
