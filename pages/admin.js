import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { useSession } from "next-auth/react";
import prisma from "../lib/prisma";
import { authOptions } from "./api/auth/[...nextauth]";

export default function Admin({ users, entries, searchStrings }) {
  const { data: session } = useSession();

  if (!session || session.user.role !== "admin") {
    return <p>Access denied</p>;
  }

  const handleRoleChange = async (id, newRole) => {
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    location.reload(); // simple way to refresh page
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this user?")) return;

    await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    location.reload();
  };

  return (
    <div className="admin-container">
      <h1>Admin Panel</h1>

      <section>
        <h2>Users</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>IGN</th>
              <th>Role</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.id}</td>
                <td>{user.ign}</td>
                <td>{user.role}</td>
                <td>
                  {user.role === "user" ? (
                    <button onClick={() => handleRoleChange(user.id, "admin")}>
                      Promote to Admin
                    </button>
                  ) : (
                    <button onClick={() => handleRoleChange(user.id, "user")}>
                      Demote to User
                    </button>
                  )}
                  <button onClick={() => handleDelete(user.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Entries</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Trainer</th>
              <th>Friend Code</th>
              <th>Owner IGN</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.id}</td>
                <td>{entry.trainerName}</td>
                <td>{entry.code}</td>
                <td>{entry.owner.ign}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Saved search strings</h2>

        <div className="info-callout">
          <div>
            <h3>Generate a new search</h3>
            <p className="muted">
              Use the Storage Search Builder to assemble a string, copy it, and
              save it to appear in this admin table. Only the creator and
              admins can view saved strings.
            </p>
          </div>
          <Link className="nav-item" href="/search-strings">
            Open Storage Search Builder
          </Link>
        </div>

        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Owner</th>
              <th>Last updated</th>
              <th>Query</th>
            </tr>
          </thead>
          <tbody>
            {searchStrings.map((saved) => (
              <tr key={saved.id}>
                <td>{saved.id}</td>
                <td>{saved.title}</td>
                <td>{saved.owner.ign}</td>
                <td>{new Date(saved.updatedAt).toLocaleString()}</td>
                <td>
                  <code>{saved.query}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export async function getServerSideProps(context) {
  const session = await getServerSession(
    context.req,
    context.res,
    authOptions
  );

  if (!session || session.user.role !== "admin") {
    return {
      redirect: { destination: "/login", permanent: false },
    };
  }

  const users = await prisma.user.findMany({
    select: { id: true, ign: true, role: true },
  });

  const rawEntries = await prisma.entry.findMany({
    include: { owner: { select: { ign: true } } },
    orderBy: { createdAt: "desc" },
  });

  const rawSearchStrings = await prisma.searchString.findMany({
    include: { owner: { select: { ign: true } } },
    orderBy: { updatedAt: "desc" },
  });

  // ✅ Convert Date objects to strings so Next.js can serialize props (both timestamps exist)
  const entries = rawEntries.map((entry) => ({
    ...entry,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  }));

  const searchStrings = rawSearchStrings.map((entry) => ({
    ...entry,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  }));

  return { props: { users, entries, searchStrings } };
}
