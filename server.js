const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const session = require("express-session");

const app = express();

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());

app.use(session({
  secret: "supersecretkey123",
  resave: false,
  saveUninitialized: true
}));

const API_KEY = process.env.API_KEY;

// ================= SETTINGS =================
const FREE_LIMIT = 10;
const DAY = 24 * 60 * 60 * 1000;

// ================= FAKE DB =================
const users = {};

// ================= REGISTER =================
app.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (users[email]) {
    return res.json({ error: "User already exists" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  users[email] = {
    email,
    password: hashedPassword,
    usage: 0,
    lastReset: Date.now()
  };

  res.json({ success: true });
});

// ================= LOGIN =================
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = users[email];

  if (!user) return res.json({ error: "User not found" });

  const match = await bcrypt.compare(password, user.password);

  if (!match) return res.json({ error: "Wrong password" });

  req.session.user = email;

  res.json({ success: true });
});

// ================= GENERATE =================
app.post("/generate", async (req, res) => {
  const email = req.session.user;

  if (!email) {
    return res.json({ error: "Not logged in" });
  }

  const user = users[email];

  // reset daily usage
  if (Date.now() - user.lastReset > DAY) {
    user.usage = 0;
    user.lastReset = Date.now();
  }

  // limit check
  if (user.usage >= FREE_LIMIT) {
    return res.json({ error: "Free limit reached. Try again tomorrow." });
  }

  const { prompt } = req.body;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [
          { role: "user", content: prompt }
        ]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || "No response";

    user.usage++;

    res.json({
      result: text,
      usage: user.usage
    });

  } catch (err) {
    res.json({ error: err.message });
  }
});

// ================= HOME =================
app.get("/", (req, res) => {
  res.send("SaaS Server is running ✔");
});

// ================= START =================
app.listen(3000, () => {
  console.log("SaaS server running");
});
