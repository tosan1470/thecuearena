const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");
let userBalance = 0;
let matches = [];
const app = express();
app.use(cors());
app.use(express.json());

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
app.post("/create-checkout-session", async (req, res) => {
  const { amount } = req.body;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
metadata: {
  amount: amount,
},
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "thecuearena Deposit",
          },
          unit_amount: amount * 100,
        },
        quantity: 1,
      },
    ],
    success_url: "https://thecuearena.com/?success=true",
    cancel_url: "https://thecuearena.com/?canceled=true",
  });

  res.json({ url: session.url });
});

app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const event = req.body;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const amount = session.metadata.amount;

    userBalance += Number(amount);
    console.log("Balance updated:", userBalance);
  }

  res.sendStatus(200);
});
app.get("/matches", (req, res) => {
  res.json(matches);
});

app.post("/create-match", (req, res) => {
  const { bet } = req.body;

  const newMatch = {
    id: Date.now(),
    bet,
    status: "waiting",
    opponentJoined: false,
  };

  matches.push(newMatch);

  res.json(newMatch);
});
app.listen(3000, () => console.log("Server running on port 3000"));
