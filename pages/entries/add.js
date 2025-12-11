import { useState } from "react";
import { useSession } from "next-auth/react";

export default function AddEntry() {
  const { data: session } = useSession();
  const [trainerName, setTrainerName] = useState("");
  const [friendCode, setFriendCode] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!session) {
      setMessage("You must be logged in.");
      return;
    }

    const res = await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trainerName,
        friendCode,
        ownerId: session.user.id,
      }),
    });

    if (res.ok) {
      setMessage("Entry added!");
      setTrainerName("");
      setFriendCode("");
    } else {
      const err = await res.json();
      setMessage(err.error || "Failed to add entry.");
    }
  };

  return (
    <div className="add-entry">
      <h1>Add Friend Code</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Trainer Name"
          value={trainerName}
          onChange={(e) => setTrainerName(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="Friend Code"
          value={friendCode}
          onChange={(e) => setFriendCode(e.target.value)}
          required
        />
        <button type="submit">Submit</button>
      </form>
      {message && <p>{message}</p>}
    </div>
  );
}
