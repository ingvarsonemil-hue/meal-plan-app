import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY; // Set this in Render's environment variables

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json());

// Serves your index.html from the "public" folder
app.use(express.static(path.join(__dirname, "public")));

// ── The only route you need ──────────────────────────────────────
app.post("/generate", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "No prompt provided" });
  }

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
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();

// If Claude returns an error, send it so we can see it
if (data.error) {
  return res.status(500).json({ error: `Claude error: ${data.error.message}` });
}

const text = data.content?.[0]?.text;
if (!text) {
  return res.status(500).json({ error: `Unexpected Claude response: ${JSON.stringify(data)}` });
}

res.json({ result: text });

  } catch (err) {
    res.status(500).json({ error: "Something went wrong: " + err.message });
  }
});

app.listen(PORT, () => console.log("Server running on port", PORT));
