import { useState, useEffect } from "react";
import { collection, addDoc, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
export default function App() {
  const query = new URLSearchParams(window.location.search);
  const success = query.get("success");
  const [bet, setBet] = useState("");
  const [balance, setBalance] = useState(10);
  const [autoPlay, setAutoPlay] = useState(false);
const [matches, setMatches] = useState([]);
  const [match, setMatch] = useState(null);
  useEffect(() => {
  const loadMatches = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "matches"));

      const matchesList = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      console.log("Auto Matches:", matchesList);
      setMatches(matchesList);
    } catch (err) {
      console.error(err);
    }
  };

  loadMatches();
}, []);
  if (success) {
  setTimeout(() => {
    setBalance((prev) => prev + 10);
    alert("Payment successful! $10 added to balance");

    window.history.replaceState({}, document.title, "/");
  }, 500);
}

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
    });

    const matchData = {
      id: docRef.id,
      bet: entryFee,
      status: "waiting",
    };

    console.log("MATCH SAVED:", matchData);

    setBalance((prev) => prev - entryFee);
    setMatch(matchData);

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

    await updateDoc(matchRef, {
      status: "playing",
      opponentJoined: true
    });

    setBalance((prev) => prev - bet);

    setMatch({
      id: matchId,
      bet,
      status: "playing"
    });

    await handleFetchMatches();

    alert("Joined match! Game starting...");
  } catch (err) {
    console.error(err);
    alert("Error joining match");
  }
};
const handleSubmitWin = () => {
  const totalPool = 2;
  const platformFee = totalPool * 0.1;
  const winnings = totalPool - platformFee;

  setBalance((prev) => prev + winnings);

alert("You won! $" + winnings.toFixed(2) + (autoPlay ? " — Next match starting..." : ""));
if (autoPlay) {
  setTimeout(() => {
    const entryFee = 1;

    setBalance((prev) => {
      if (prev < entryFee) {
        setMatch({ status: "finished" });
        return prev;
      }

      setMatch({
        bet: entryFee,
        status: "playing",
      });

      return prev - entryFee;
    });
  }, 1500);
} else {
  setMatch({
    status: "finished",
  });
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
    status: "playing",
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
  } catch (err) {
    console.error(err);
    alert("Error fetching matches");
  }
};
  return (
    <div style={{ padding: "30px", fontFamily: "Arial" }}>
      <h1>thecuearena</h1>

<h3>Balance: ${balance.toFixed(2)}</h3>

<button onClick={handleDeposit}>Deposit $10</button>
<button onClick={handleFetchMatches}>Fetch Matches</button>

<h3>Matches Count: {matches.length}</h3>

     <div style={{ marginTop: "20px" }}>
          <input
            type="number"
            placeholder="Enter bet ($1 min)"
            value={bet}
            onChange={(e) => setBet(e.target.value)}
          />
          <button onClick={handleCreateMatch}>Create Match</button>
        </div>

      {match && match.status === "waiting" && (
        <div>
          <p>Bet: ${match.bet}</p>
          <p>Waiting for opponent...</p>
        </div>
      )}

      {match && match.status === "playing" && (
        <div>
          <p>Game Started</p>
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
    matches.map((m) => (
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

        <button onClick={() => handleJoinMatch(m.id, m.bet)}>
          Join Match
        </button>
      </div>
    ))
  )}
</div>
    </div>
  );
}
