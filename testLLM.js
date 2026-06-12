import { Ollama } from 'ollama';

const ollama = new Ollama({ host: "http://localhost:11434" });

async function test() {
  const prompt = `You are a professional chef. Create a gastronomic menu.
RESPOND STRICTLY IN VALID JSON. YOU MUST INCLUDE ALL THREE COURSES (entree, plat, dessert) WITH FULL DETAILS. DO NOT USE "...".

Expected JSON format:
{
  "status": "success",
  "gastronomic_menu": [
    {
      "jour": "Unique Dish",
      "entree": {
        "nom": "Name of the dish",
        "ingredients": [{"name": "Ing 1", "quantite": "50", "unite": "g"}],
        "allergens": ["Gluten"],
        "preparation_steps": "1. Step one. 2. Step two. 3. Step three."
      },
      "plat": {
        "nom": "Name of the dish",
        "ingredients": [{"name": "Ing 1", "quantite": "50", "unite": "g"}],
        "allergens": ["Gluten"],
        "preparation_steps": "1. Step one. 2. Step two. 3. Step three."
      },
      "dessert": {
        "nom": "Name of the dish",
        "ingredients": [{"name": "Ing 1", "quantite": "50", "unite": "g"}],
        "allergens": ["Gluten"],
        "preparation_steps": "1. Step one. 2. Step two. 3. Step three."
      }
    }
  ]
}`;

  console.log("Generating...");
  try {
    const response = await ollama.generate({
      model: "llama3.2-vision",
      prompt: prompt,
      format: "json",
      options: { temperature: 0.5, num_predict: 8192 }
    });
    console.log(response.response);
  } catch (e) {
    console.log(e);
  }
}

test();
