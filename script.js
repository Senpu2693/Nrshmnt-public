const OPENAI_API_KEY = 'insert-key-here';

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('recipeForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const calories = parseInt(document.getElementById('calories').value);
        const protein = parseInt(document.getElementById('protein').value);
        const cuisine = document.getElementById('cuisine').value;
        
        document.getElementById('loadingIndicator').classList.remove('hidden');
        document.getElementById('recipeResult').classList.add('hidden');
        document.getElementById('recipeContent').innerText = '';

        try {
            const recipe = await generateRecipe(cuisine, calories, protein);
            document.getElementById('loadingIndicator').classList.add('hidden');
            document.getElementById('recipeResult').classList.remove('hidden');
            document.getElementById('recipeContent').innerHTML = recipe.content;
        } catch (error) {
            document.getElementById('loadingIndicator').classList.add('hidden');
            document.getElementById('recipeResult').classList.remove('hidden');
            
            // Format the error message with line breaks for better readability
            const formattedMessage = error.message.replace(/\n/g, '<br>');
            document.getElementById('recipeContent').innerHTML = 'An error occurred while generating the recipe:<br><br>' + formattedMessage;
        }
    });
});

async function callOpenAI(prompt) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.8
        })
    });

    if (!response.ok) throw new Error('API error');
    const data = await response.json();
    return data.choices[0].message.content;
}

function getCuisineProteinSources(cuisine) {
    const sources = {
        chinese: [
            "Tofu (100g = 8g protein, 70 cal)",
            "Chicken breast (100g = 31g protein, 165 cal)",
            "Shrimp (100g = 24g protein, 99 cal)",
            "Beef (100g = 26g protein, 250 cal)",
            "Egg (50g = 6g protein, 72 cal)"
        ],
        mexican: [
            "Black beans (100g = 21g protein, 341 cal)",
            "Chicken breast (100g = 31g protein, 165 cal)",
            "Ground beef (100g = 26g protein, 250 cal)",
            "Pork (100g = 27g protein, 242 cal)",
            "Queso fresco (100g = 18g protein, 268 cal)"
        ],
        italian: [
            "Chicken breast (100g = 31g protein, 165 cal)",
            "Ground beef (100g = 26g protein, 250 cal)",
            "Mozzarella (100g = 22g protein, 280 cal)",
            "Parmesan (100g = 35g protein, 431 cal)",
            "Ricotta (100g = 11g protein, 174 cal)"
        ],
        indian: [
            "Lentils/Dal (100g = 9g protein, 116 cal)",
            "Paneer (100g = 18g protein, 265 cal)",
            "Chicken breast (100g = 31g protein, 165 cal)",
            "Chickpeas (100g = 15g protein, 364 cal)",
            "Greek yogurt (100g = 10g protein, 59 cal)"
        ],
        american: [
            "Chicken breast (100g = 31g protein, 165 cal)",
            "Ground beef (100g = 26g protein, 250 cal)",
            "Turkey breast (100g = 29g protein, 135 cal)",
            "Eggs (100g = 13g protein, 143 cal)",
            "Cheddar cheese (100g = 25g protein, 403 cal)"
        ],
        japanese: [
            "Tofu (100g = 8g protein, 70 cal)",
            "Salmon (100g = 20g protein, 208 cal)",
            "Tuna (100g = 23g protein, 144 cal)",
            "Chicken breast (100g = 31g protein, 165 cal)",
            "Edamame (100g = 11g protein, 121 cal)"
        ]
    };
    return sources[cuisine].join("\n");
}

function formatIngredient(amount, name, unit = 'g') {
    // Check if the name includes measurement info in parentheses
    if (name.includes('(')) {
        const measurementMatch = name.match(/\((.*?)\)/);
        if (measurementMatch) {
            // Remove the measurement info from the name
            name = name.replace(/\s*\(.*?\)/, '');
            // Use the unit from the measurement info
            const measurementInfo = measurementMatch[1];
            if (measurementInfo.includes('tbsp')) unit = 'tbsp';
            else if (measurementInfo.includes('tsp')) unit = 'tsp';
            else if (measurementInfo.includes('cloves')) unit = 'cloves';
            else if (measurementInfo.includes('cup')) unit = 'cup';
        }
    }
    
    // Don't add unit for certain ingredients
    if (['cloves', 'tbsp', 'tsp', 'cup'].includes(unit)) {
        return `${amount} ${unit} ${name}`;
    }
    return `${amount}${unit} ${name}`;
}

async function generateRecipe(cuisine, targetCalories, targetProtein) {
    // Generate 10 recipes in parallel
    const attempts = Array.from({length: 10}, (_, i) => generateSingleRecipe(cuisine, targetCalories, targetProtein, i + 1));
    
    try {
        // Wait for all attempts to complete
        const results = await Promise.allSettled(attempts);
        
        // Collect all attempts (both successful and failed)
        const allAttempts = results.map(result => {
            if (result.status === 'fulfilled') {
                return result.value;
            } else {
                try {
                    const data = JSON.parse(result.reason.recipeData);
                    return {
                        type: 'failed',
                        totalNutrition: data.totalNutrition,
                        recipeData: data
                    };
                } catch (e) {
                    return null;
                }
            }
        }).filter(attempt => attempt !== null);

        // Sort by how close they are to targets
        const sortByFitness = (a, b) => {
            const getCalories = (attempt) => attempt.type === 'success' ? attempt.totalNutrition.calories : attempt.totalNutrition.calories;
            const getProtein = (attempt) => attempt.type === 'success' ? attempt.totalNutrition.protein : attempt.totalNutrition.protein;
            
            const aCalorieDiff = Math.abs(getCalories(a) - targetCalories);
            const aProteinDiff = Math.abs(getProtein(a) - targetProtein);
            const bCalorieDiff = Math.abs(getCalories(b) - targetCalories);
            const bProteinDiff = Math.abs(getProtein(b) - targetProtein);
            return (aCalorieDiff * 1.2 + aProteinDiff) - (bCalorieDiff * 1.2 + bProteinDiff);
        };
        
        // Get the best match
        const bestMatch = allAttempts.sort(sortByFitness)[0];
        
        // Generate recipe HTML
        let html = '';
        if (bestMatch.type === 'success') {
            html = bestMatch.content;
        } else {
            html = generateRecipeHtml(bestMatch.recipeData, bestMatch.totalNutrition, targetCalories, targetProtein);
        }
        
        return { content: html };
    } catch (error) {
        throw error;
    }
}

function generateRecipeHtml(recipeData, totalNutrition, targetCalories, targetProtein) {
    // Generate mathematical breakdown with full macros
    const mathBreakdown = recipeData.ingredients.map(ingredient => 
        `- ${formatIngredient(ingredient.amount, ingredient.name, ingredient.unit)} = ${ingredient.macros.protein}g protein, ${ingredient.macros.calories} cal, ${ingredient.macros.carbs}g carbs, ${ingredient.macros.fat}g fat`
    ).join('\n');

    return `
        <h2>${recipeData.name}</h2>
        <div class="nutrition-summary">
            <h3>Recipe Nutrition</h3>
            <div class="nutrition-comparison">
                <div class="target-values">
                    <h4>Target Values</h4>
                    <p>Calories: ${targetCalories} kcal</p>
                    <p>Protein: ${targetProtein} g</p>
                </div>
                <div class="actual-values">
                    <h4>Actual Values</h4>
                    <p>
                        Calories: ${totalNutrition.calories} kcal
                        <span class="difference">(${totalNutrition.calories > targetCalories ? '+' : ''}${(totalNutrition.calories - targetCalories).toFixed(1)})</span>
                    </p>
                    <p>
                        Protein: ${totalNutrition.protein} g
                        <span class="difference">(${totalNutrition.protein > targetProtein ? '+' : ''}${(totalNutrition.protein - targetProtein).toFixed(1)})</span>
                    </p>
                    <p>Carbs: ${totalNutrition.carbs} g</p>
                    <p>Fat: ${totalNutrition.fat} g</p>
                </div>
            </div>
        </div>

        <div class="math-breakdown">
            <h3>Nutritional Calculations</h3>
            <pre>${mathBreakdown}\n\nTotal = ${totalNutrition.protein}g protein, ${totalNutrition.calories} cal, ${totalNutrition.carbs}g carbs, ${totalNutrition.fat}g fat</pre>
        </div>
        
        <h3>Ingredients (${recipeData.ingredients.length} total)</h3>
        <div class="ingredients-list">
            ${recipeData.ingredients.map((ingredient, index) => `
                <div class="ingredient-item">
                    <details>
                        <summary>${formatIngredient(ingredient.amount, ingredient.name, ingredient.unit)}</summary>
                        <div class="ingredient-macros">
                            <p>Calories: ${ingredient.macros.calories}kcal</p>
                            <p>Protein: ${ingredient.macros.protein}g</p>
                            <p>Carbs: ${ingredient.macros.carbs}g</p>
                            <p>Fat: ${ingredient.macros.fat}g</p>
                        </div>
                    </details>
                </div>
            `).join('')}
        </div>
        
        <h3>Instructions</h3>
        <div class="instructions-list">
            ${recipeData.instructions.map(instruction => `
                <p class="instruction">${instruction}</p>
            `).join('')}
        </div>
        
        <p class="cooking-time">Cooking Time: ${recipeData.cookingTime}</p>
    `;
}

async function generateSingleRecipe(cuisine, targetCalories, targetProtein, attemptNum) {
    const cuisineSpecifics = {
        chinese: {
            spices: "ginger, garlic, five-spice powder, white pepper",
            sauces: "soy sauce, oyster sauce, sesame oil, black vinegar",
            aromatics: "green onions, cilantro, sesame seeds"
        },
        mexican: {
            spices: "cumin, chili powder, oregano, coriander",
            sauces: "salsa, guacamole, crema, chipotle sauce",
            aromatics: "cilantro, lime, onions, garlic"
        },
        italian: {
            spices: "basil, oregano, rosemary, thyme",
            sauces: "marinara, pesto, olive oil, balsamic",
            aromatics: "garlic, parsley, sage"
        },
        indian: {
            spices: "turmeric, garam masala, cumin, coriander",
            sauces: "raita, chutney, curry sauce",
            aromatics: "ginger, garlic, cilantro, curry leaves"
        },
        american: {
            spices: "black pepper, paprika, garlic powder, onion powder",
            sauces: "BBQ sauce, hot sauce, ranch, mustard",
            aromatics: "parsley, thyme, garlic"
        },
        japanese: {
            spices: "wasabi, togarashi, ginger, garlic",
            sauces: "soy sauce, mirin, sake, ponzu",
            aromatics: "nori, bonito flakes, sesame seeds"
        }
    };

    const specifics = cuisineSpecifics[cuisine];
    const prompt = `Create a flavorful ${cuisine} recipe that EXACTLY matches these nutritional targets:
REQUIRED: ${targetCalories} calories (±100), ${targetProtein}g protein (±10)

Available protein sources with exact values:
${getCuisineProteinSources(cuisine)}

Requirements:
• Must include at least 6-8 total ingredients
• Must use at least 2-3 spices/seasonings from: ${specifics.spices}
• Must include at least one sauce/condiment from: ${specifics.sauces}
• Must use aromatics/garnishes from: ${specifics.aromatics}
• Include detailed marination or seasoning steps
• Provide specific cooking techniques for maximum flavor

Calculation steps:
• Start with a protein source from above
• Calculate exact portion to get close to protein target
• Add complementary ingredients to hit calorie target
• Show all mathematical calculations

Example:
For a 500 calorie, 30g protein recipe:
• Choose chicken breast (31g protein/100g):
  - Need ~97g chicken for 30g protein (97g × 0.31 = 30g protein)
  - This provides 160 calories (97g × 1.65 cal/g)
• Need 340 more calories (500 - 160)
• Add rice, vegetables, sauces, and seasonings

Tips:
- Use gram measurements for main ingredients
- Use standard measurements (tbsp, tsp, cloves) for seasonings and aromatics
- Keep portions realistic
- Focus on authentic ${cuisine} flavors and techniques
- Aim for 1-2 servings
- Include marination times if applicable


    Format the response in JSON with the following structure:
    {
        "name": "Recipe Name",
        "totalNutrition": {
            "calories": number,
            "protein": number,
            "carbs": number,
            "fat": number
        },
        "ingredients": [
            {
                "name": "Ingredient name",
                "amount": "measurement",
                "unit": "g/tbsp/tsp/cloves",
                "macros": {
                    "calories": number,
                    "protein": number,
                    "carbs": number,
                    "fat": number
                }
            }
        ],
        "instructions": ["step 1", "step 2", ...],
        "cookingTime": "time in minutes"
    }`;

    try {
        const recipeResponse = await callOpenAI(prompt);
        console.log(`[Attempt ${attemptNum}] API Response:`, recipeResponse);
        
        let recipeData;
        try {
            recipeData = JSON.parse(recipeResponse);
        } catch (parseError) {
            console.error(`[Attempt ${attemptNum}] JSON Parse Error:`, parseError);
            console.log(`[Attempt ${attemptNum}] Failed to parse response:`, recipeResponse);
            throw new Error('Invalid recipe format received');
        }
        
        console.log(`[Attempt ${attemptNum}] Parsed Recipe Data:`, recipeData);
        
        // Calculate total nutrition from ingredients
        const totalNutrition = recipeData.ingredients.reduce((total, ingredient) => {
            console.log(`[Attempt ${attemptNum}] Adding macros for ${ingredient.name}:`, ingredient.macros);
            return {
                calories: total.calories + ingredient.macros.calories,
                protein: total.protein + ingredient.macros.protein,
                carbs: total.carbs + ingredient.macros.carbs,
                fat: total.fat + ingredient.macros.fat
            };
        }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

        // Round to 1 decimal place for better display
        Object.keys(totalNutrition).forEach(key => {
            totalNutrition[key] = Math.round(totalNutrition[key] * 10) / 10;
        });

        // Generate HTML for the recipe
        const html = generateRecipeHtml(recipeData, totalNutrition, targetCalories, targetProtein);
        
        console.log(`[Attempt ${attemptNum}] Final Total Nutrition:`, totalNutrition);
        console.log(`[Attempt ${attemptNum}] Target Values - Calories: ${targetCalories}, Protein: ${targetProtein}`);
        
        // Log the actual nutritional values
        console.log(`[Attempt ${attemptNum}] Actual nutritional values:`, totalNutrition);
        console.log(`[Attempt ${attemptNum}] Target values - Calories: ${targetCalories}, Protein: ${targetProtein}`);
        return { 
            type: 'success',
            content: html,
            recipeData: recipeData,
            totalNutrition: totalNutrition
        };
    } catch (error) {
        if (error.message === 'Recipe does not meet nutritional requirements') {
            throw error;
        }
        throw new Error(`[Attempt ${attemptNum}] Failed to parse recipe response: ` + error.message);
    }
}
