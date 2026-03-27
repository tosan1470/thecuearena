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
  const response = await fetch("http://localhost:3000/create-checkout-session", {
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
    if (!bet || bet < 1) {
      alert("Minimum bet is $1");
      return;
    }

    if (balance < bet) {
      alert("Insufficient balance");
      return;
    }

    setBalance(balance - bet);

    setMatch({
      bet,
      status: "waiting",
      result: null,
    });
  };

  const handleJoinMatch = () => {
    if (balance < match.bet) {
      alert("Insufficient balance");
      return;
    }

    setBalance(balance - match.bet);

    setMatch({
      ...match,
      status: "playing",
    });
  };

  const handleSubmitWin = () => {
    setMatch({
      ...match,
      status: "pending",
      result: "Player A claims win",
    });
  };

  const handleConfirm = () => {
    const winnings = match.bet * 2 * 0.9;
    setBalance(balance + winnings);

    setMatch({
      ...match,
      status: "completed",
    });
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
