import dynamic from "next/dynamic";
import Head from "next/head";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import { readGymState, sortGyms } from "../lib/gyms";
import { authOptions } from "./api/auth/[...nextauth]";

const GymMap = dynamic(() => import("../components/gyms/GymMap"), {
  ssr: false,
  loading: () => <p className="gym-map-loading">Loading gym map…</p>,
});

interface GymPageProps {
  gyms: Awaited<ReturnType<typeof readGymState>>["gyms"];
  importedAt: string | null;
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

  const state = await readGymState();

  return {
    props: {
      gyms: sortGyms(state.gyms),
      importedAt: state.importedAt,
    },
  };
};

export default function GymsPage({
  gyms,
  importedAt,
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
              and open turn-by-turn directions in Google Maps.
            </p>
          </div>
          <div className="gym-legend" aria-label="Map legend">
            <span><i className="standard" /> Gym</span>
            <span><i className="ex" /> EX eligible</span>
            <span><i className="new" /> Added in the last week</span>
          </div>
        </header>
        <GymMap gyms={gyms} importedAt={importedAt} />
      </main>
    </>
  );
}
