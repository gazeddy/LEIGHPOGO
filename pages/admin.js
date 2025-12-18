import { getServerSession } from "next-auth/next";
import { useSession } from "next-auth/react";
import { useMemo, useState } from "react";
import prisma from "../lib/prisma";
import { authOptions } from "./api/auth/[...nextauth]";

export default function Admin({ users, entries, searchStrings }) {
  const { data: session, status } = useSession();

  const [entryList, setEntryList] = useState(entries);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [editForm, setEditForm] = useState({ trainerName: "", friendCode: "", team: "MYSTIC" });
  const [passwordResets, setPasswordResets] = useState({});

  // Sidebar "accordion" state (matches your production look: green buttons on the left)
  const [activeSection, setActiveSection] = useState("entries");

  const counts = useMemo(
    () => ({
      entries: entryList.length,
      users: users.length,
      searches: searchStrings.length,
    }),
    [entryList.length, users.length, searchStrings.length]
  );

  if (status === "loading") return <p>Loading...</p>;
  if (!session || session.user.role !== "admin") return <p>Access denied</p>;

  const handleRoleChange = async (id, newRole) => {
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    location.reload();
  };

  const handlePasswordReset = async (id) => {
    const newPassword = passwordResets[id] ?? "";

    if (newPassword.length < 8) {
      alert("Password must be at least 8 characters long");
      return;
    }

    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });

    if (!res.ok) {
      alert("Failed to reset password");
      return;
    }

    alert("Password updated");
    setPasswordResets((current) => ({ ...current, [id]: "" }));
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    location.reload();
  };

  const startEdit = (entry) => {
    setEditingEntryId(entry.id);
    setEditForm({ trainerName: entry.trainerName, friendCode: entry.code, team: entry.team });
  };

  const cancelEdit = () => {
    setEditingEntryId(null);
    setEditForm({ trainerName: "", friendCode: "", team: "MYSTIC" });
  };

  const handleEntrySave = async (id) => {
    const res = await fetch(`/api/admin/entries/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });

    if (!res.ok) {
      alert("Failed to update entry");
      return;
    }

    const updated = await res.json();
    setEntryList((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...updated } : entry))
    );
    cancelEdit();
  };

  const handleEntryDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this entry?")) return;

    const res = await fetch(`/api/admin/entries/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("Failed to delete entry");
      return;
    }

    setEntryList((current) => current.filter((entry) => entry.id !== id));
  };

  const NavButton = ({ id, children }) => {
    const isActive = activeSection === id;
    return (
      <button
        type="button"
        className={`admin-navbtn ${isActive ? "active" : ""}`}
        onClick={() => setActiveSection(id)}
      >
        <span>{children}</span>
        <span className="admin-navbtn-caret">▼</span>
      </button>
    );
  };

  return (
    <div className="admin-wrap">
      <h1 className="admin-title">Admin Panel</h1>

      <div className="admin-layout">
        {/* LEFT: green accordion buttons like your production */}
        <aside className="admin-sidebar">
          <NavButton id="entries">Entries ({counts.entries})</NavButton>
          <NavButton id="users">Users ({counts.users})</NavButton>
          <NavButton id="searches">Saved search strings ({counts.searches})</NavButton>
        </aside>

        {/* RIGHT: content */}
        <main className="admin-content">
          {activeSection === "entries" && (
            <section>
              <h2 className="admin-section-title">Entries</h2>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Trainer</th>
                    <th>Friend Code</th>
                    <th>Team</th>
                    <th>Owner IGN</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entryList.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.id}</td>
                      <td>
                        {editingEntryId === entry.id ? (
                          <input
                            type="text"
                            value={editForm.trainerName}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                trainerName: e.target.value,
                              }))
                            }
                          />
                        ) : (
                          entry.trainerName
                        )}
                      </td>
                      <td>
                        {editingEntryId === entry.id ? (
                          <input
                            type="text"
                            value={editForm.friendCode}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                friendCode: e.target.value,
                              }))
                            }
                          />
                        ) : (
                          entry.code
                        )}
                      </td>
                      <td>
                        {editingEntryId === entry.id ? (
                          <select
                            value={editForm.team}
                            onChange={(e) =>
                              setEditForm((prev) => ({ ...prev, team: e.target.value }))
                            }
                          >
                            <option value="INSTINCT">Instinct (Yellow)</option>
                            <option value="MYSTIC">Mystic (Blue)</option>
                            <option value="VALOR">Valor (Red)</option>
                          </select>
                        ) : (
                          entry.team
                        )}
                      </td>
                      <td>{entry.owner?.ign}</td>
                      <td>
                        {editingEntryId === entry.id ? (
                          <>
                            <button onClick={() => handleEntrySave(entry.id)}>Save</button>
                            <button onClick={cancelEdit}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(entry)}>Edit</button>
                            <button onClick={() => handleEntryDelete(entry.id)}>Delete</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {activeSection === "users" && (
            <section>
              <h2 className="admin-section-title">Users</h2>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>IGN</th>
                    <th>Role</th>
                    <th>Reset password</th>
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
                        <input
                          type="password"
                          placeholder="New password"
                          value={passwordResets[user.id] ?? ""}
                          onChange={(e) =>
                            setPasswordResets((current) => ({
                              ...current,
                              [user.id]: e.target.value,
                            }))
                          }
                        />
                        <button onClick={() => handlePasswordReset(user.id)}>Save</button>
                      </td>
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
          )}

          {activeSection === "searches" && (
            <section>
              <h2 className="admin-section-title">Saved search strings</h2>

              {/* Generator link + textbox removed (saved list stays visible) */}
              <table className="admin-table">
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
                      <td>{saved.owner?.ign}</td>
                      <td>{new Date(saved.updatedAt).toLocaleString()}</td>
                      <td>
                        <code>{saved.query}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </main>
      </div>

      <style jsx>{`
        .admin-wrap {
          padding: 12px 16px;
        }
        .admin-title {
          font-size: 42px;
          font-weight: 800;
          margin: 6px 0 14px;
        }
        .admin-layout {
          display: flex;
          gap: 16px;
          align-items: flex-start;
        }
        .admin-sidebar {
          width: 220px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding-top: 6px;
        }
        .admin-content {
          flex: 1;
          min-width: 0;
        }
        .admin-navbtn {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          border: 0;
          border-radius: 6px;
          padding: 8px 10px;
          font-weight: 700;
          color: #fff;
          background: #1f8a3b;
          cursor: pointer;
          box-shadow: 0 1px 0 rgba(0, 0, 0, 0.25);
        }
        .admin-navbtn:hover {
          filter: brightness(1.05);
        }
        .admin-navbtn.active {
          outline: 2px solid rgba(255, 255, 255, 0.18);
        }
        .admin-navbtn-caret {
          font-size: 12px;
          opacity: 0.95;
        }
        .admin-section-title {
          margin: 0 0 10px;
          font-size: 20px;
          font-weight: 800;
        }
        .admin-table {
          width: 100%;
          border-collapse: collapse;
        }
        .admin-table th,
        .admin-table td {
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding: 8px 8px;
          text-align: left;
          vertical-align: top;
        }
        .admin-table th {
          font-weight: 800;
        }
        .admin-table input {
          max-width: 220px;
        }
        @media (max-width: 900px) {
          .admin-layout {
            flex-direction: column;
          }
          .admin-sidebar {
            width: 100%;
            flex-direction: row;
            flex-wrap: wrap;
          }
          .admin-navbtn {
            width: auto;
          }
        }
      `}</style>
    </div>
  );
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);

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

  const entries = rawEntries.map((entry) => ({
    ...entry,
    createdAt: entry.createdAt?.toISOString?.() ?? entry.createdAt,
    updatedAt: entry.updatedAt?.toISOString?.() ?? entry.updatedAt,
  }));

  // Fetch saved search strings safely (won't crash if the model name differs)
  let searchStrings = [];
  try {
    const searchModel =
      prisma.searchString ||
      prisma.savedSearchString ||
      prisma.savedSearch ||
      prisma.searchStrings ||
      prisma.savedSearchStrings;

    if (searchModel?.findMany) {
      const rawSearchStrings = await searchModel.findMany({
        include: { owner: { select: { ign: true } } },
        orderBy: { updatedAt: "desc" },
      });

      searchStrings = rawSearchStrings.map((entry) => ({
        ...entry,
        createdAt: entry.createdAt?.toISOString?.() ?? entry.createdAt,
        updatedAt: entry.updatedAt?.toISOString?.() ?? entry.updatedAt,
      }));
    }
  } catch (e) {
    searchStrings = [];
  }

  // NOTE: don't return session in props (prevents undefined serialization issues)
  return { props: { users, entries, searchStrings } };
}
