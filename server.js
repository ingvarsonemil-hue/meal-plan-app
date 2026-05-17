require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/generate-meal', async (req, res) => {
  try {
    const { profile, date } = req.body;
    if (!profile) return res.status(400).json({ error: 'Profile is required' });
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY not set on server' });

    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `You are a professional nutritionist and chef. Generate a complete day meal plan for:
- Age: ${profile.age}, Weight: ${profile.weight}kg, Height: ${profile.height}cm, Gender: ${profile.gender}
- Goal: ${profile.goal}, Activity: ${profile.activity_level}
- Daily Calories: ${profile.daily_calories || 2000}
- Dietary: ${(profile.dietary_preferences || []).join(', ') || 'None'}
- Allergies: ${(profile.allergies || []).join(', ') || 'None'}
- Cooking Skill: ${profile.cooking_skill || 'Intermediate'}, Max Cook Time: ${profile.max_cook_time || 30} min
- Budget: ${profile.weekly_budget || 100} ${profile.currency || 'USD'}/week
- Date: ${date}

Return ONLY valid JSON, no markdown:
{"meals":[{"type":"Breakfast","recipe_name":"","calories":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"prep_time_minutes":0,"cook_time_minutes":0,"ingredients":[{"name":"","amount":"","estimated_cost":0}],"instructions":[""]}],"total_calories":0,"total_protein":0,"total_carbs":0,"total_fat":0,"estimated_cost":0}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a professional nutritionist. Respond with valid JSON only, no markdown, no explanation.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 3000,
    });

    const raw = completion.choices[0].message.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    res.json(JSON.parse(raw));
  } catch (err) {
    console.error('generate-meal error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/generate-grocery-list', async (req, res) => {
  try {
    const { meals, budget, currency } = req.body;
    if (!meals || !meals.length) return res.status(400).json({ error: 'Meals are required' });
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY not set on server' });

    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const mealSummary = meals.map(m => `${m.type}: ${m.recipe_name}`).join('\n');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a professional meal planner. Respond with valid JSON only, no markdown, no explanation.' },
        { role: 'user', content: `Generate a consolidated grocery list for these meals:\n${mealSummary}\nBudget: ${budget || 100} ${currency || 'USD'}\nReturn ONLY valid JSON:\n{"items":[{"name":"","quantity":"","category":"Produce","estimated_cost":0,"checked":false}],"total_estimated_cost":0}\nCategories: Produce, Protein, Dairy, Grains, Pantry, Beverages, Frozen, Other` }
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const raw = completion.choices[0].message.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    res.json(JSON.parse(raw));
  } catch (err) {
    console.error('generate-grocery error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/:page.html', (req, res) => {
  const file = path.join(__dirname, 'public', `${req.params.page}.html`);
  res.sendFile(file, (err) => { if (err) res.status(404).send('Page not found'); });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Mealzy running on port ${PORT}`);
});
