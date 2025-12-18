import React from "react";
import Link from "next/link";
import TeamBadge from "../../components/TeamBadge";
import prisma from "../../lib/prisma";

export async function getServerSideProps(context) {
  const id = parseInt(context.params.id, 10);

  if (isNaN(id)) {
    return { notFound: true };
  }

  try {
    const entry = await prisma.entry.findUnique({
      where: { id },
    });

    if (!entry) {
      return { notFound: true };
    }

    return {
      props: { entry },
    };
  } catch (error) {
    console.error("Error loading entry:", error);
    return { notFound: true };
  }
}

export default function EntryPage({ entry }) {
  return (
    <div style={{ padding: "2rem" }}>
      <h1>Friend Code Entry #{entry.id}</h1>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <TeamBadge team={entry.team} />
        <p style={{ margin: 0 }}><strong>Trainer Name:</strong> {entry.trainerName}</p>
      </div>
      <p><strong>Friend Code:</strong> {entry.code}</p>

      <Link href="/entries">← Back to entries</Link>
    </div>
  );
}
