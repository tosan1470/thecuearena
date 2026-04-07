import { useState } from "react";

export default function App() {
  const query = new URLSearchParams(window.location.search);
  const success = query.get("success");
  const [bet, setBet] = useState("");
  const [balance, setBalance] = useState(10);
  const [match, setMatch] = useState(null);
  if (success) {
  setTimeout(() => {
    alert("Payment successful! $10 added to balance");
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

  const handleCreateMatch = () => { 
      const entryFee = 1;

  if (balance < entryFee) {
    alert("Insufficient balance");
    return;
  }

  setBalance((prev) => prev - entryFee);

  alert("Match created! Entry Fee deducted.");
    
  };

const handleJoinMatch = () => {
  const entryFee = 1;

  if (balance < entryFee) {
    alert("Insufficient balance");
    return;
  }

  setBalance((prev) => prev - entryFee);

  alert("Match joined! Game starting...");
};

const handleSubmitWin = () => {
  const totalPool = 2;        // 2 players × $1
  const platformFee = totalPool * 0.1;  // 10%
  const winnings = totalPool - platformFee;

  setBalance((prev) => prev + winnings);

  alert("You won! $" + winnings.toFixed(2) + " added to your balance.");
};

  const handleDispute = () => {
    setMatch({
      ...match,
      status: "disputed",
    });
  };

  return (
    <div style={{ padding: "30px", fontFamily: "Arial" }}>
      <h1>thecuearena</h1>

      <h3>Balance: ${balance.toFixed(2)}</h3>
      <button onClick={handleDeposit}>Deposit $10</button>

      {!match && (
        <div style={{ marginTop: "20px" }}>
          <input
            type="number"
            placeholder="Enter bet ($1 min)"
            value={bet}
            onChange={(e) => setBet(e.target.value)}
          />
          <button onClick={handleCreateMatch}>Create Match</button>
        </div>
      )}

      {match && match.status === "waiting" && (
        <div>
          <p>Bet: ${match.bet}</p>
          <p>Waiting for opponent...</p>
          <button onClick={handleJoinMatch}>Join Match</button>
        </div>
      )}

      {match && match.status === "playing" && (
        <div>
          <p>Game Started</p>
          <button onClick={handleSubmitWin}>Submit Win</button>
        </div>
      )}

      {match && match.status === "pending" && (
        <div>
          <p>{match.result}</p>
          <button onClick={handleConfirm}>Confirm</button>
          <button onClick={handleDispute}>Dispute</button>
        </div>
      )}

      {match && match.status === "completed" && (
        <p>Match Completed — Winner Paid</p>
      )}

      {match && match.status === "disputed" && (
        <p>Match Disputed — Admin Review</p>
      )}
    </div>
  );
}
