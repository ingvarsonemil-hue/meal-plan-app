import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ✅ NEW: buildPrompt function with Claude fix
function buildPrompt(userPrompt) {
  const durationInstructions = `
- The shoppingList should cover the entire week.
- For 7-day plans: keep steps to maximum 3 per meal (not 5).
- Keep ingredients to maximum 4 per meal.
- Keep descriptions to one short sentence.
- This is critical to stay within response limits.
`;

  return `
You are a meal planning assistant.

${durationInstructions}

User request:
${userPrompt}
`;
}

app.post("/generate", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "No prompt provided" });
  }

  try {
    // ✅ Use buildPrompt here
    const finalPrompt = buildPrompt(prompt);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 8000,
        messages: [{ role: "user", content: finalPrompt }]
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: `Claude error: ${data.error.message}` });
    }

    const text = data.content?.[0]?.text;
    if (!text) {
      return res.status(500).json({ error: `Unexpected response: ${JSON.stringify(data)}` });
    }

    res.json({ result: text });

  } catch (err) {
    res.status(500).json({ error: "Something went wrong: " + err.message });
  }
});

app.listen(PORT, () => console.log("Server running on port", PORT));
