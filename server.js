require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// POST /api/generate-meal
app.post('/api/generate-meal', async (req, res) => {
  try {
    const { profile, date } = req.body;

    if (!profile) {
      return res.status(400).json({ error: 'Profile is required' });
    }

    const prompt = `You are a professional nutritionist and chef. Generate a complete day meal plan for the following user profile:

Profile:
- Age: ${profile.age}
- Weight: ${profile.weight}kg
- Height: ${profile.height}cm
- Gender: ${profile.gender}
- Goal: ${profile.goal}
- Activity Level: ${profile.activity_level}
- Daily Calorie Target: ${profile.daily_calories || 2000} calories
- Dietary Preferences: ${(profile.dietary_preferences || []).join(', ') || 'None'}
- Allergies: ${(profile.allergies || []).join(', ') || 'None'}
- Cooking Skill: ${profile.cooking_skill || 'Intermediate'}
- Max Cook Time: ${profile.max_cook_time || 30} minutes
- Weekly Budget: ${profile.weekly_budget || 100} ${profile.currency || 'USD'}
- Date: ${date}

Generate a full day meal plan with 4 meals (Breakfast, Lunch, Dinner, Snack). Return ONLY valid JSON in this exact format:
{
  "meals": [
    {
      "type": "Breakfast",
      "recipe_name": "Recipe Name",
      "calories": 450,
      "protein": 25,
      "carbs": 45,
      "fat": 15,
      "fiber": 8,
      "prep_time_minutes": 10,
      "cook_time_minutes": 15,
      "ingredients": [
        {"name": "ingredient name", "amount": "1 cup", "estimated_cost": 0.50}
      ],
      "instructions": [
        "Step 1 instruction",
        "Step 2 instruction"
      ]
    }
  ],
  "total_calories": 1800,
  "total_protein": 120,
  "total_carbs": 180,
  "total_fat": 60,
  "estimated_cost": 15.00
}

Make the meals delicious, practical, and aligned with the user's preferences and goals. Ensure nutritional values are accurate.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a professional nutritionist. Always respond with valid JSON only, no markdown, no explanation.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 3000,
    });

    const content = completion.choices[0].message.content;
    let mealPlan;

    try {
      // Strip markdown code blocks if present
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      mealPlan = JSON.parse(cleaned);
    } catch (parseError) {
      console.error('Failed to parse meal plan JSON:', content);
      return res.status(500).json({ error: 'Failed to parse meal plan from AI' });
    }

    res.json(mealPlan);
  } catch (error) {
    console.error('Error generating meal plan:', error);
    res.status(500).json({ error: error.message || 'Failed to generate meal plan' });
  }
});

// POST /api/generate-grocery-list
app.post('/api/generate-grocery-list', async (req, res) => {
  try {
    const { meals, budget, currency } = req.body;

    if (!meals || !meals.length) {
      return res.status(400).json({ error: 'Meals are required' });
    }

    const mealSummary = meals
      .map((m) => `${m.type}: ${m.recipe_name} (${m.ingredients?.map((i) => i.name).join(', ')})`)
      .join('\n');

    const prompt = `Based on these meals for the week, generate a consolidated grocery list:

Meals:
${mealSummary}

Weekly Budget: ${budget || 100} ${currency || 'USD'}

Consolidate ingredients, remove duplicates, and organize by category. Return ONLY valid JSON:
{
  "items": [
    {
      "name": "Item name",
      "quantity": "2 lbs",
      "category": "Produce",
      "estimated_cost": 3.50,
      "checked": false
    }
  ],
  "total_estimated_cost": 75.00
}

Categories must be one of: Produce, Protein, Dairy, Grains, Pantry, Beverages, Frozen, Other`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a professional meal planner. Always respond with valid JSON only, no markdown, no explanation.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const content = completion.choices[0].message.content;
    let groceryList;

    try {
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      groceryList = JSON.parse(cleaned);
    } catch (parseError) {
      console.error('Failed to parse grocery list JSON:', content);
      return res.status(500).json({ error: 'Failed to parse grocery list from AI' });
    }

    res.json(groceryList);
  } catch (error) {
    console.error('Error generating grocery list:', error);
    res.status(500).json({ error: error.message || 'Failed to generate grocery list' });
  }
});

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Fallback — serve the requested html page
app.get('/:page.html', (req, res) => {
  const file = path.join(__dirname, 'public', `${req.params.page}.html`);
  res.sendFile(file, (err) => {
    if (err) res.status(404).send('Page not found');
  });
});

app.listen(PORT, () => {
  console.log(`🌿 Mealzy running at http://localhost:${PORT}`);
});
