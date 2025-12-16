import React from "react";
import Link from "next/link";
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

      <p><strong>Trainer Name:</strong> {entry.trainerName}</p>
      <p><strong>Friend Code:</strong> {entry.friendCode}</p>

      <Link href="/entries">← Back to entries</Link>
    </div>
  );
}
