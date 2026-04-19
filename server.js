const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Simple in-memory rate limit (basic SaaS protection)
const userRequests = {};
const LIMIT = 5; // 5 requests per minute per IP

function rateLimit(req, res, next) {
  const ip = req.ip;

  if (!userRequests[ip]) {
    userRequests[ip] = { count: 0, time: Date.now() };
  }

  const user = userRequests[ip];

  // reset every 60 seconds
  if (Date.now() - user.time > 60000) {
    user.count = 0;
    user.time = Date.now();
  }

  user.count++;

  if (user.count > LIMIT) {
    return res.json({ result: "Too many requests. Try again in 1 minute." });
  }

  next();
}

app.get("/", (req, res) => {
  res.send("SaaS Server is running ✔");
});

app.post("/generate", rateLimit, async (req, res) => {
  try {
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
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    const data = await response.json();

    const text = data.content?.[0]?.text || JSON.stringify(data);

    res.json({ result: text });

  } catch (err) {
    res.json({ result: "Server error: " + err.message });
  }
});

app.listen(3000, () => {
  console.log("SaaS server running on http://localhost:3000");
});