import prisma from "../lib/prisma"

export default function Home({ entries }) {
  return (
    <div className="container">
      <h1>Pokémon GO Friend Codes</h1>
      {entries.length === 0 ? (
        <p>No entries yet.</p>
      ) : (
        <ul>
          {entries.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.owner.ign}</strong>: {entry.code} (
              {new Date(entry.createdAt).toLocaleString()})
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Fetch all entries and include the owner's IGN
export async function getServerSideProps() {
  const entries = await prisma.entry.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      owner: {
        select: {
          ign: true, // Only select the IGN field
        },
      },
    },
  })

  return {
    props: { entries },
  }
}
