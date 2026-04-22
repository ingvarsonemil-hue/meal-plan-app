const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const session = require("express-session");
const Stripe = require("stripe");
const { Pool } = require("pg");

const app = express();

// ================= MIDDLEWARE =================
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || "fallback-secret-change-me", // FIX 1: use env var
  resave: false,
  saveUninitialized: true
}));

// ================= STRIPE =================
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// ================= DATABASE =================
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ================= SETTINGS =================
const FREE_LIMIT = 10;
const DAY = 24 * 60 * 60 * 1000;
const API_KEY = process.env.API_KEY;

// ================= INIT DB (RUN ONCE) =================
// FIX 2: protect /init-db with a secret so random visitors can't trigger it
app.get("/init-db", async (req, res) => {
  if (req.query.secret !== process.env.INIT_SECRET) {
    return res.status(403).send("Forbidden");
  }

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

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    await db.query(
      "INSERT INTO users (email, password) VALUES ($1, $2)",
      [email, hashedPassword]
    );

    res.json({ success: true });

  } catch (err) {
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

  if (!email) {
    return res.json({ error: "Not logged in" });
  }

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

  // limit check
  if (!user.premium && user.usage >= FREE_LIMIT) {
    return res.json({ error: "Upgrade to Premium" });
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

  if (!email) {
    return res.json({ error: "Not logged in" });
  }

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
    success_url: "https://meal-plan-app-2nn3.onrender.com/success",
    cancel_url: "https://meal-plan-app-2nn3.onrender.com/"
  });

  res.json({ url: session.url });
});

// ================= STRIPE WEBHOOK =================
// FIX 3: verify Stripe webhook signature to prevent fake events
app.post("/stripe-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET // add this in Render env vars
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const email = event.data.object.customer_email;

    await db.query(
      "UPDATE users SET premium = true WHERE email = $1",
      [email]
    );
  }

  res.sendStatus(200);
});

// ================= SUCCESS PAGE =================
app.get("/success", (req, res) => {
  res.send("Payment successful ✔ You are now Premium!");
});

// ================= HOME =================
app.get("/", (req, res) => {
  res.send("SaaS Server is running ✔");
});

// ================= START =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
