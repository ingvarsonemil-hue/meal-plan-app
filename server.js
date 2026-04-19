const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Stripe = require("stripe");
const { Pool } = require("pg");
const path = require("path");

const app = express();

// ================= ENV =================
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// ================= DB =================
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ================= MIDDLEWARE =================
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static("public"));

// ================= AUTH =================
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.json({ error: "No token" });

  try {
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded.email;
    next();
  } catch {
    res.json({ error: "Invalid token" });
  }
}

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
    res.json({ error: "User exists" });
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

  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "7d" });

  res.json({ success: true, token });
});

// ================= GENERATE AI =================
app.post("/generate", auth, async (req, res) => {
  const email = req.user;
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
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await response.json();
  const text = data.content?.[0]?.text || "No response";

  res.json({ result: text });
});

// ================= STRIPE =================
app.post("/create-checkout-session", auth, async (req, res) => {
  const email = req.user;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: email,
    line_items: [
      {
        price: process.env.STRIPE_PRICE_ID,
        quantity: 1
      }
    ],
    success_url: "https://meal-plan-app-2nn3.onrender.com/",
    cancel_url: "https://meal-plan-app-2nn3.onrender.com/"
  });

  res.json({ url: session.url });
});

// ================= INIT DB =================
app.get("/init-db", async (req, res) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE,
      password TEXT
    );
  `);

  res.send("DB ready ✔");
});

// ================= START =================
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
