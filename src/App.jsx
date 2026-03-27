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
      result: null,
    });
  };

  const handleJoinMatch = () => {
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
          <button onClick={handleSubmitWin}>
            Submit Win (Player A)
          </button>
        </div>
      )}

      {match && match.status === "pending" && (
        <div style={{ marginTop: "20px" }}>
          <h3>Result Submitted</h3>
          <p>{match.result}</p>
          <p>Player B must confirm</p>

          <button onClick={handleConfirm}>
            Confirm
          </button>

          <button onClick={handleDispute} style={{ marginLeft: "10px" }}>
            Dispute
          </button>
        </div>
      )}

      {match && match.status === "completed" && (
        <div style={{ marginTop: "20px" }}>
          <h3>Match Completed</h3>
          <p>Winner Paid</p>
        </div>
      )}

      {match && match.status === "disputed" && (
        <div style={{ marginTop: "20px" }}>
          <h3>Match Disputed</h3>
          <p>Admin review required</p>
        </div>
      )}
    </div>
  );
}
