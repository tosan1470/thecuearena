import { useState } from "react";

export default function App() {
  const [bet, setBet] = useState("");
  const [matchCreated, setMatchCreated] = useState(false);

  const handleCreateMatch = () => {
    if (!bet || bet < 1) {
      alert("Minimum bet is $1");
      return;
    }
    setMatchCreated(true);
  };

  return (
    <div style={{ padding: "30px", fontFamily: "Arial" }}>
      <h1>thecuearena</h1>
      <p>Play. Compete. Win.</p>

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

      {matchCreated && (
        <div style={{ marginTop: "20px" }}>
          <h3>Match Created</h3>
          <p>Bet: ${bet}</p>
          <button>Join Match</button>
        </div>
      )}
    </div>
  );
}
