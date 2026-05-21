import { useState, useEffect } from "react";
import logo from "./assets/logo.png";
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
  const [onlinePlayers, setOnlinePlayers] = useState(0);
  const [now, setNow] = useState(Date.now());
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
  const timer = setInterval(() => {
    setNow(Date.now());
  }, 1000);

  return () => clearInterval(timer);
}, []);
useEffect(() => {
  const unsubscribe = onSnapshot(
    collection(db, "matches"),
    (snapshot) => {
      const matchesList = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));

      setMatches(matchesList);

      const uniquePlayers = new Set();

      matchesList.forEach((m) => {
        if (m.player1) uniquePlayers.add(m.player1);
        if (m.player2) uniquePlayers.add(m.player2);
      });

      setOnlinePlayers(uniquePlayers.size);
    }
  );

  return () => unsubscribe();
}, []);
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

    setMatch({
  status: "finished",
  winnings
});

setIsInGame(false);
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
    const uniquePlayers = new Set();

matchesList.forEach((m) => {
  if (m.player1) uniquePlayers.add(m.player1);
  if (m.player2) uniquePlayers.add(m.player2);
});

setOnlinePlayers(uniquePlayers.size);

    alert("Matches loaded: " + matchesList.length); // ✅ NEW
  } catch (err) {
    console.error(err);
    alert("Error fetching matches");
  }
};
  return (
    <>
  <div
    style={{
      width: "100%",
      padding: "15px 30px",
      background: "#111827",
      borderBottom: "1px solid #1e293b",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      position: "sticky",
      top: 0,
      zIndex: 1000
    }}
  >
    <div
  style={{
    display: "flex",
    alignItems: "center",
    gap: "12px"
  }}
>
  <img
    src={logo}
    alt="thecuearena"
    style={{
      width: "55px",
      height: "55px",
      borderRadius: "12px",
      boxShadow: "0 0 15px rgba(234,179,8,0.6)"
    }}
  />

  <h2
    style={{
      color: "#38bdf8",
      margin: 0,
      textShadow: "0 0 10px #38bdf8"
    }}
  >
    thecuearena
  </h2>
</div>

    <div
      style={{
        color: "#22c55e",
        fontWeight: "bold"
      }}
    >
      ● LIVE
    </div>
  </div>
    <div
  style={{
    padding: window.innerWidth < 768 ? "15px" : "30px",
    fontFamily: "Arial",
    background: "#0f172a",
    minHeight: "100vh",
    color: "white"
  }}
>
      <h1
  style={{
    fontSize: window.innerWidth < 768 ? "32px" : "42px",
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
    style={{
   width: window.innerWidth < 768 ? "100%" : "250px",   
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid #334155",
  background: "#1e293b",
  color: "white",
  marginRight: "10px"
}}
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
      fontSize: window.innerWidth < 768 ? "28px" : "36px"
    }}
  >
    ${balance.toFixed(2)}
  </h1>
</div>

<button
  onClick={handleDeposit}

  onMouseEnter={(e) => {
    e.target.style.transform = "scale(1.05)";
    e.target.style.boxShadow = "0 0 25px rgba(34,197,94,0.9)";
  }}

  onMouseLeave={(e) => {
    e.target.style.transform = "scale(1)";
    e.target.style.boxShadow = "0 0 15px rgba(34,197,94,0.5)";
  }}

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

  onMouseEnter={(e) => {
    e.target.style.transform = "scale(1.05)";
    e.target.style.boxShadow =
      "0 0 25px rgba(34,197,94,0.9)";
  }}

  onMouseLeave={(e) => {
    e.target.style.transform = "scale(1)";
    e.target.style.boxShadow =
      "0 0 15px rgba(34,197,94,0.5)";
  }}

  style={{
    background: "#22c55e",
    border: "none",
    padding: "12px 20px",
    borderRadius: "10px",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
    transition: "all 0.3s ease",
    boxShadow: "0 0 15px rgba(34,197,94,0.5)",
    transform: "scale(1)",
  }}
>
  Fetch Matches
</button>

<div
  style={{
    marginTop: "15px",
    marginBottom: "20px",
    display: "flex",
    gap: "20px",
    flexWrap: "wrap"
  }}
>
  <div
    style={{
      background: "#1e293b",
      padding: "12px 20px",
      borderRadius: "12px",
      border: "1px solid #334155"
    }}
  >
    🎮 Matches: {matches.length}
  </div>

  <div
    style={{
      background: "#1e293b",
      padding: "12px 20px",
      borderRadius: "12px",
      border: "1px solid #334155",
      color: "#22c55e",
      fontWeight: "bold"
    }}
  >
    ● LIVE PLAYERS: {onlinePlayers}
  </div>
</div>

     <div style={{ marginTop: "20px" }}>
          <input
            type="number"
            style={{
            width: window.innerWidth < 768 ? "100%" : "250px",
            padding: "12px",
            borderRadius: "10px",
            border: "1px solid #334155",
            background: "#1e293b",
            color: "white",
            marginRight: "10px"
           }}
            placeholder="Enter bet ($1 min)"
            value={bet}
            onChange={(e) => setBet(e.target.value)}
          />
          <button
  onClick={handleCreateMatch}
  onMouseEnter={(e) => {
  if (!isInGame) {
    e.target.style.transform = "scale(1.05)";
    e.target.style.boxShadow =
      "0 0 30px rgba(245,158,11,0.9)";
  }
}}

onMouseLeave={(e) => {
  if (!isInGame) {
    e.target.style.transform = "scale(1)";
    e.target.style.boxShadow =
      "0 0 20px rgba(245,158,11,0.5)";
  }
}}          
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
 <div
  style={{
    background: "#14532d",
    border: "1px solid #22c55e",
    padding: "20px",
    borderRadius: "15px",
    textAlign: "center",
    boxShadow: "0 0 20px rgba(34,197,94,0.5)"
  }}
>
  <h2 style={{ color: "#22c55e" }}>
    🏆 Victory!
  </h2>

  <p>
    You won ${match.winnings?.toFixed(2)}
  </p>
</div>

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

  onMouseEnter={(e) => {
    e.currentTarget.style.transform = "translateY(-3px)";
    e.currentTarget.style.boxShadow =
      "0 0 25px rgba(56,189,248,0.4)";
  }}

  onMouseLeave={(e) => {
    e.currentTarget.style.transform = "translateY(0)";
    e.currentTarget.style.boxShadow =
      "0 0 20px rgba(15,23,42,0.5)";
  }}

  style={{
    background: "#1e293b",
    border: "1px solid #334155",
    padding: "20px",
    marginBottom: "15px",
    borderRadius: "15px",
    boxShadow: "0 0 20px rgba(15,23,42,0.5)",
    transition: "all 0.3s ease",
    transform: "translateY(0)"
  }}
>
        <p>Bet: ${m.bet}</p>
        <p
  style={{
    color: "#facc15",
    fontWeight: "bold",
    marginTop: "5px"
  }}
>
  ⏱ Expires in:{" "}
  {String(
  Math.floor(
    Math.max(0, m.expiresAt - now) / 60000
  )
).padStart(2, "0")}
:
{String(
  Math.floor(
    (Math.max(0, m.expiresAt - now) % 60000) / 1000
  )
).padStart(2, "0")}
</p>
        <div
  style={{
    display: "inline-block",
    padding: "6px 12px",
    borderRadius: "999px",
    background:
      m.status === "waiting"
        ? "rgba(34,197,94,0.2)"
        : "rgba(239,68,68,0.2)",
    color:
      m.status === "waiting"
        ? "#22c55e"
        : "#ef4444",
    fontWeight: "bold",
    marginBottom: "10px",
    border:
      m.status === "waiting"
        ? "1px solid #22c55e"
        : "1px solid #ef4444",
    boxShadow:
      m.status === "waiting"
        ? "0 0 10px rgba(34,197,94,0.5)"
        : "0 0 10px rgba(239,68,68,0.5)"
  }}
>
  {m.status.toUpperCase()}
</div>
       
  <div
  style={{
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginTop: "10px",
    marginBottom: "10px"
  }}
>
  <div
    style={{
      width: "45px",
      height: "45px",
      borderRadius: "50%",
      background: "#22c55e",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: "bold",
      color: "white",
      fontSize: "18px",
      boxShadow: "0 0 12px rgba(34,197,94,0.5)"
    }}
  >
    {m.player1Name?.charAt(0).toUpperCase()}
  </div>

 <div>
  <p
    style={{
      color: "#38bdf8",
      fontWeight: "bold",
      fontSize: "18px",
      margin: 0
    }}
  >
    {m.player1Name}
  </p>

  <small style={{ color: "#94a3b8" }}>
    Ready to Play
  </small>
</div>
</div>

        <button
  onClick={() => handleJoinMatch(m.id, m.bet)}
  onMouseEnter={(e) => {
  if (!isInGame) {
    e.target.style.transform = "scale(1.05)";
    e.target.style.boxShadow =
      "0 0 25px rgba(34,197,94,0.9)";
  }
}}

onMouseLeave={(e) => {
  if (!isInGame) {
    e.target.style.transform = "scale(1)";
    e.target.style.boxShadow =
      "0 0 15px rgba(34,197,94,0.5)";
  }
}}        
  disabled={isInGame}
  style={{
    background: isInGame ? "#475569" : "#22c55e",
    border: "none",
    padding: "12px 20px",
    borderRadius: "10px",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
    transition: "all 0.3s ease",
    transform: "scale(1)",
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
</>
  );
}
