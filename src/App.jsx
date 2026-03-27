import { useState } from "react";

export default function App() {
  const [bet, setBet] = useState("");
  const [match, setMatch] = useState(null);

  const handleCreateMatch = () => {
    if (!bet || bet < 1) {
      alert("Minimum bet is $1");
      return;
    }

    setMatch({
      bet,
      status: "waiting",
    });
  };

  const handleJoinMatch = () => {
    setMatch({
      ...match,
      status: "playing",
    });
  };

  return (
    <div style={{ padding: "30px", fontFamily: "Arial" }}>
      <h1>thecuearena</h1>
      <p>Play. Compete. Win.</p>

      {!match && (
        <div style={{ marginTop: "20px" }}>
          <input
            type="number"
            placeholder="Enter bet ($1 min)"
            value={bet}
            onChange={(e) => setBet(e.target.value)}
            style={{ padding: "10px", marginRight: "10px" }}
          />

          <button onClick={handleCreateMatch}>
            Create Match
          </button>
        </div>
      )}

      {match && match.status === "waiting" && (
        <div style={{ marginTop: "20px" }}>
          <h3>Match Created</h3>
          <p>Bet: ${match.bet}</p>
          <p>Waiting for opponent...</p>
          <button onClick={handleJoinMatch}>
            Join Match
          </button>
        </div>
      )}

      {match && match.status === "playing" && (
        <div style={{ marginTop: "20px" }}>
          <h3>Game Started</h3>
          <p>Bet: ${match.bet}</p>
          <p>Both players are in the match</p>
        </div>
      )}
    </div>
  );
}
