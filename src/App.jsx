import { useState, useEffect } from "react";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  onSnapshot,
  deleteDoc
} from "firebase/firestore";import { db } from "./firebase";
const userId =
  localStorage.getItem("userId") ||
  Math.random().toString(36).substring(7);

localStorage.setItem("userId", userId);
const savedUsername =
  localStorage.getItem("username") || "";
export default function App() {
  const query = new URLSearchParams(window.location.search);
  const success = query.get("success");
  const [bet, setBet] = useState("");
  const [balance, setBalance] = useState(10);
  const [autoPlay, setAutoPlay] = useState(false);
const [matches, setMatches] = useState([]);
  const [match, setMatch] = useState(null);
  const [isInGame, setIsInGame] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [username, setUsername] = useState(savedUsername);
useEffect(() => {
  if (!match?.id) return;

  const matchRef = doc(db, "matches", match.id);

  const unsubscribe = onSnapshot(matchRef, (docSnap) => {
    if (!docSnap.exists()) return;

    const data = docSnap.data();

    console.log("LIVE UPDATE:", data);

    const updatedMatch = {
      id: docSnap.id,
      ...data
    };

    setMatch(updatedMatch);

    if (
      updatedMatch.status === "playing" ||
      updatedMatch.status === "waiting"
    ) {
      setIsInGame(true);
    } else {
      setIsInGame(false);
    }
  });

  return () => unsubscribe();
}, [match?.id]);

 useEffect(() => {
  if (success) {
    setTimeout(() => {
      setBalance((prev) => prev + 10);

      alert("Payment successful! $10 added to balance");

      window.history.replaceState({}, document.title, "/");
    }, 500);
  }
}, [success]);

const handleDeposit = async () => {
  alert("clicked");
  const response = await fetch("https://thecuearena-backend.onrender.com/create-checkout-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount: 10 }),
  });

  const data = await response.json();

  window.location.href = data.url;
};

const handleCreateMatch = async () => {
  const entryFee = 1;

  if (balance < entryFee) {
    alert("Insufficient balance");
    return;
  }

  try {
    const docRef = await addDoc(collection(db, "matches"), {
      bet: entryFee,
      status: "waiting",
      createdAt: Date.now(),
      expiresAt: Date.now() + 1000 * 60 * 5,
      player1: userId,
      player1Name: username || "Anonymous",
      player2: null
    });

    setBalance((prev) => prev - entryFee);

    setMatch({
      id: docRef.id,
      bet: entryFee,
      status: "waiting",
      player1: userId,
      player2: null
    });
    setIsCreator(true);
    alert("Match created!");
  } catch (err) {
    console.error(err);
    alert("Error creating match");
  }
};
const handleJoinMatch = async (matchId, bet) => {
  if (balance < bet) {
    alert("Insufficient balance");
    return;
  }

  try {
    const matchRef = doc(db, "matches", matchId);
   
    const selectedMatch = matches.find(m => m.id === matchId);

if (selectedMatch.player1 === userId) {
  alert("You cannot join your own match");
  return;
}

    await updateDoc(matchRef, {
  status: "playing",
  player2: userId,
  player2Name: username || "Anonymous"
});
    setBalance((prev) => prev - bet);

    setMatch({
  id: matchId,
  bet,
  status: "playing",
  player2: userId
});
    alert("Joined match! Game starting...");
  } catch (err) {
    console.error(err);
    alert("Error joining match");
  }
};
const handleSubmitWin = async () => {
  if (!match) return;

  try {
    const totalPool = 2;
    const platformFee = totalPool * 0.1;
    const winnings = totalPool - platformFee;

    setBalance((prev) => prev + winnings);

    const matchRef = doc(db, "matches", match.id);

    await deleteDoc(matchRef);

    setMatch({
      status: "finished"
    });

    setIsInGame(false);

    alert("You won! $" + winnings.toFixed(2));
  } catch (error) {
    console.error(error);
    alert("Error submitting win");
  }
};
  const handleRematch = () => {
  const entryFee = 1;

  if (balance < entryFee) {
    alert("Insufficient balance for rematch");
    return;
  }

  setBalance((prev) => prev - entryFee);

 setMatch({
  bet: entryFee,
  status: "waiting",
  player2: null
});

  alert("Rematch created! Waiting for opponent...");
};
  
  const handleDispute = () => {
    setMatch({
      ...match,
      status: "disputed",
    });
  };
const handleFetchMatches = async () => {
  try {
    const querySnapshot = await getDocs(collection(db, "matches"));

    const matchesList = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log("Matches:", matchesList);

    setMatches(matchesList);

    alert("Matches loaded: " + matchesList.length); // ✅ NEW
  } catch (err) {
    console.error(err);
    alert("Error fetching matches");
  }
};
  return (
    <div
  style={{
    padding: "30px",
    fontFamily: "Arial",
    background: "#0f172a",
    minHeight: "100vh",
    color: "white"
  }}
>
      <h1
  style={{
    fontSize: "42px",
    fontWeight: "bold",
    color: "#38bdf8",
    marginBottom: "20px",
    textShadow: "0 0 20px #38bdf8"
  }}
>
  thecuearena
</h1>
      <div style={{ marginBottom: "20px" }}>
  <input
    type="text"
    placeholder="Enter username"
    value={username}
    onChange={(e) => {
      setUsername(e.target.value);
      localStorage.setItem("username", e.target.value);
    }}
  />
</div>

<div
  style={{
    background: "#1e293b",
    padding: "20px",
    borderRadius: "15px",
    marginBottom: "20px",
    boxShadow: "0 0 15px rgba(56,189,248,0.3)"
  }}
>
  <h2
    style={{
      color: "#38bdf8",
      margin: 0
    }}
  >
    Wallet Balance
  </h2>

  <h1
    style={{
      marginTop: "10px",
      fontSize: "36px"
    }}
  >
    ${balance.toFixed(2)}
  </h1>
</div>

<button
  onClick={handleDeposit}
  style={{
    background: "#38bdf8",
    border: "none",
    padding: "12px 20px",
    borderRadius: "10px",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
    marginRight: "10px",
    boxShadow: "0 0 15px rgba(56,189,248,0.5)"
  }}
>
  Deposit $10
</button>
<button
  onClick={handleFetchMatches}
  style={{
    background: "#22c55e",
    border: "none",
    padding: "12px 20px",
    borderRadius: "10px",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
    boxShadow: "0 0 15px rgba(34,197,94,0.5)"
  }}
>
  Fetch Matches
</button>

<h3>Matches Count: {matches.length}</h3>

     <div style={{ marginTop: "20px" }}>
          <input
            type="number"
            placeholder="Enter bet ($1 min)"
            value={bet}
            onChange={(e) => setBet(e.target.value)}
          />
          <button
  onClick={handleCreateMatch}
  disabled={isInGame}
  style={{
    background: isInGame ? "#475569" : "#f59e0b",
    border: "none",
    padding: "14px 24px",
    borderRadius: "12px",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
    marginTop: "10px",
    boxShadow: isInGame
      ? "none"
      : "0 0 20px rgba(245,158,11,0.5)"
  }}
>
  {isInGame ? "Already In Match" : "Create Match"}
</button>
        </div>

      {match && match.status === "waiting" && (
        <div>
          <p>Bet: ${match.bet}</p>
          <p>Waiting for opponent...</p>
        </div>
      )}

      {match && match.status === "playing" && match.player2 && match.player1 !== match.player2 && (
        <div>
          <p>
  Game Started:{" "}
  {match.player1 === userId
    ? match.player2Name
    : match.player1Name}
</p>
          <button onClick={handleSubmitWin}>Submit Win</button>
        </div>
      )}

{match && match.status === "finished" && (
  <div>
 <p>Game Finished</p>

    <button onClick={handleRematch}>
      Rematch ($1 Entry Fee)
    </button>  
    
    <button onClick={() => setAutoPlay(!autoPlay)}>
      Auto Play: {autoPlay ? "ON" : "OFF"}
    </button>
  </div>
)}
      {match && match.status === "completed" && (
        <p>Match Completed — Winner Paid</p>
      )}

      {match && match.status === "disputed" && (
        <p>Match Disputed — Admin Review</p>
      )}
<div style={{ marginTop: "20px" }}>
  <h3>Available Matches</h3>

  {matches.length === 0 ? (
    <p>No matches yet</p>
  ) : (
    matches
  .filter(
  m =>
    m.status === "waiting" &&
    m.player1 !== userId &&
    m.expiresAt > Date.now()
)
  .map((m) => (
      <div
        key={m.id}
        style={{
          border: "1px solid #ccc",
          padding: "10px",
          marginBottom: "10px"
        }}
      >
        <p>Bet: ${m.bet}</p>
        <p>Status: {m.status}</p>
        <p>Player: {m.player1Name}</p>

        <button
  onClick={() => handleJoinMatch(m.id, m.bet)}
  disabled={isInGame}
  style={{
    background: isInGame ? "#475569" : "#22c55e",
    border: "none",
    padding: "12px 20px",
    borderRadius: "10px",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
    marginTop: "10px",
    width: "100%",
    boxShadow: isInGame
      ? "none"
      : "0 0 15px rgba(34,197,94,0.5)"
  }}
>
  {isInGame ? "In Match" : "Join Match"}
</button>
      </div>
    ))
  )}
</div>
    </div>
  );
}
