const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const session = require("express-session");
const Stripe = require("stripe");
const { Pool } = require("pg");

const app = express();

// ================= ENV =================
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// ================= DB =================
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ================= MIDDLEWARE =================
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());

app.use(session({
  secret: "supersecretkey123",
  resave: false,
  saveUninitialized: false
}));

// ================= STATIC FRONTEND =================
app.use(express.static("public"));

// ================= SETTINGS =================
const FREE_LIMIT = 10;
const DAY = 24 * 60 * 60 * 1000;

// ================= INIT DB =================
app.get("/init-db", async (req, res) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE,
      password TEXT,
      usage INT DEFAULT 0,
      premium BOOLEAN DEFAULT false,
      last_reset BIGINT DEFAULT 0
    );
  `);

  res.send("DB ready ✔");
});

// ================= REGISTER =================
app.post("/register", async (req, res) => {
  const { email, password } = req.body;

  const hashed = await bcrypt.hash(password, 10);

  try {
    await db.query(
      "INSERT INTO users (email, password) VALUES ($1, $2)",
      [email, hashed]
    );

    res.json({ success: true });
  } catch {
    res.json({ error: "User already exists" });
  }
});

// ================= LOGIN =================
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const result = await db.query(
    "SELECT * FROM users WHERE email = $1",
    [email]
  );

  const user = result.rows[0];

  if (!user) return res.json({ error: "User not found" });

  const match = await bcrypt.compare(password, user.password);

  if (!match) return res.json({ error: "Wrong password" });

  req.session.user = email;

  res.json({ success: true });
});

// ================= GENERATE AI =================
app.post("/generate", async (req, res) => {
  const email = req.session.user;

  if (!email) return res.json({ error: "Not logged in" });

  const result = await db.query(
    "SELECT * FROM users WHERE email = $1",
    [email]
  );

  const user = result.rows[0];

  // reset daily usage
  if (Date.now() - user.last_reset > DAY) {
    await db.query(
      "UPDATE users SET usage = 0, last_reset = $1 WHERE email = $2",
      [Date.now(), email]
    );
    user.usage = 0;
  }

  if (!user.premium && user.usage >= FREE_LIMIT) {
    return res.json({ error: "Upgrade to premium" });
  }

  const { prompt } = req.body;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      messages: [
        { role: "user", content: prompt }
      ]
    })
  });

  const data = await response.json();
  const text = data.content?.[0]?.text || "No response";

  await db.query(
    "UPDATE users SET usage = usage + 1 WHERE email = $1",
    [email]
  );

  res.json({
    result: text,
    usage: user.usage + 1,
    premium: user.premium
  });
});

// ================= STRIPE CHECKOUT =================
app.post("/create-checkout-session", async (req, res) => {
  const email = req.session.user;

  if (!email) return res.json({ error: "Not logged in" });

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    customer_email: email,
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: {
            name: "Meal Plan Premium"
          },
          unit_amount: 500
        },
        quantity: 1
      }
    ],
    success_url: "https://meal-plan-app-2nn3.onrender.com/",
    cancel_url: "https://meal-plan-app-2nn3.onrender.com/"
  });

  res.json({ url: session.url });
});

// ================= STRIPE WEBHOOK =================
app.post("/stripe-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const event = JSON.parse(req.body);

  if (event.type === "checkout.session.completed") {
    const email = event.data.object.customer_email;

    await db.query(
      "UPDATE users SET premium = true WHERE email = $1",
      [email]
    );
  }

  res.sendStatus(200);
});

// ================= START SERVER =================
app.listen(PORT, () => {
  console.log("SaaS server running on port", PORT);
});
