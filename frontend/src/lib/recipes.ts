/**
 * Gopi Bahu — Cook with Zepto: recipe data.
 *
 * Ingredient → product mapping is deliberately honest, not decorative: every
 * `productId` below is a REAL id from the live 5,060-item catalogue
 * (lib/products.ts / the seeded Supabase `products` table) — never a fake
 * disconnected object. The catalogue was generated for grocery breadth, not
 * recipe completeness, so a handful of common staples (garlic, fresh
 * ginger, cashews, whole/ground spices, chickpeas, fresh dairy cream)
 * genuinely don't exist under any name in it. Rather than invent fake
 * purchasable products for those, `productId: null` marks them unavailable
 * with a short, honest note — which is exactly the "some ingredients aren't
 * available" flow this feature is meant to demonstrate, not a gap papered
 * over.
 */
import { getById, type Product } from "./products";

export interface RecipeIngredient {
  id: string;              // stable within the recipe, e.g. "paneer"
  name: string;             // human ingredient name shown as the row title
  quantityLabel: string;    // "200g", "2 medium", "to taste"
  productId: number | null; // real catalogue id, or null if not stocked
  note?: string;            // shown when productId is null
}

export interface RecipeStep {
  step: number;
  text: string;
}

export interface Nutrition {
  calories: number; // kcal, per serving
  protein: number;  // g
  carbs: number;    // g
  fat: number;      // g
}

export type Difficulty = "Easy" | "Medium" | "Hard";

export interface Recipe {
  id: string;
  title: string;
  description: string;
  image: string;
  timeMins: number;
  difficulty: Difficulty;
  servings: number;
  rating: number;
  reviews: number;
  cuisine: string;
  tags: string[];
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  nutrition: Nutrition;
}

// ── Recipes ───────────────────────────────────────────────────────────────────

export const RECIPES: Recipe[] = [
  {
    id: "paneer-butter-masala",
    title: "Paneer Butter Masala",
    description:
      "Rich, creamy and restaurant-style at home — soft paneer simmered in a buttery, mildly spiced tomato gravy.",
    image:
      "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=900&q=80",
    timeMins: 30,
    difficulty: "Easy",
    servings: 4,
    rating: 4.7,
    reviews: 12400,
    cuisine: "North Indian",
    tags: ["Indian", "Vegetarian", "Dinner", "Under 30 min"],
    ingredients: [
      { id: "paneer",   name: "Paneer",             quantityLabel: "200g",     productId: 4253 },
      { id: "tomato",   name: "Tomato",              quantityLabel: "500g",     productId: 655 },
      { id: "onion",    name: "Onion",               quantityLabel: "250g",     productId: 889 },
      { id: "garlic",   name: "Garlic",              quantityLabel: "6 cloves", productId: null, note: "Not currently stocked — you likely have this at home" },
      { id: "ginger",   name: "Ginger",              quantityLabel: "1 inch",  productId: null, note: "Not currently stocked — you likely have this at home" },
      { id: "chilli",   name: "Green Chilli",        quantityLabel: "2 pieces", productId: 1064 },
      { id: "cashew",   name: "Cashew",              quantityLabel: "10 pieces (30g)", productId: null, note: "Not currently stocked in our catalogue" },
      { id: "butter",   name: "Butter",              quantityLabel: "100g",     productId: 4448 },
      { id: "cream",    name: "Fresh Cream",         quantityLabel: "100ml",   productId: null, note: "Not currently stocked — Butter above adds similar richness" },
      { id: "methi",    name: "Kasuri Methi",        quantityLabel: "10g",      productId: 1251, note: undefined },
      { id: "chilli-pw",name: "Red Chilli Powder",   quantityLabel: "5g",       productId: null, note: "Not currently stocked — you likely have this at home" },
      { id: "salt",     name: "Salt",                quantityLabel: "to taste", productId: 2600 },
    ],
    steps: [
      { step: 1, text: "Boil tomatoes with roughly chopped onion, ginger and garlic for 10 minutes until soft, then blend to a smooth puree." },
      { step: 2, text: "Melt half the butter in a pan, add the puree and cook on medium heat for 8–10 minutes, stirring often, until it darkens and the raw smell goes." },
      { step: 3, text: "Stir in red chilli powder, kasuri methi (crushed between your palms) and salt. Simmer for 3–4 minutes." },
      { step: 4, text: "Add the cream (or extra butter) and cubed paneer. Simmer gently for 4–5 minutes — don't boil hard, or the paneer turns rubbery." },
      { step: 5, text: "Finish with the remaining butter and slit green chillies. Rest for 2 minutes off the heat before serving." },
      { step: 6, text: "Serve hot with naan, roti, or steamed rice." },
    ],
    nutrition: { calories: 320, protein: 14, carbs: 12, fat: 24 },
  },

  {
    id: "dal-tadka",
    title: "Dal Tadka",
    description: "Classic comfort food — yellow lentils simmered soft, finished with a sizzling ghee and cumin tempering.",
    image:
      "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=900&q=80",
    timeMins: 25,
    difficulty: "Easy",
    servings: 4,
    rating: 4.6,
    reviews: 8900,
    cuisine: "North Indian",
    tags: ["Indian", "Vegetarian", "Quick meals", "High protein", "Under 30 min", "Dinner"],
    ingredients: [
      { id: "dal",       name: "Toor Dal",         quantityLabel: "1 cup (200g)", productId: 2521 },
      { id: "onion",     name: "Onion",            quantityLabel: "1 medium",     productId: 889 },
      { id: "tomato",    name: "Tomato",           quantityLabel: "2 medium",     productId: 655 },
      { id: "garlic",    name: "Garlic",           quantityLabel: "4 cloves",     productId: null, note: "Not currently stocked — you likely have this at home" },
      { id: "ginger",    name: "Ginger",           quantityLabel: "1 inch",       productId: null, note: "Not currently stocked — you likely have this at home" },
      { id: "chilli",    name: "Green Chilli",     quantityLabel: "2 pieces",     productId: 1064 },
      { id: "ghee",      name: "Ghee",             quantityLabel: "1 tbsp",       productId: 2646 },
      { id: "cumin",     name: "Cumin Seeds",      quantityLabel: "1 tsp",        productId: null, note: "Not currently stocked — you likely have this at home" },
      { id: "turmeric",  name: "Turmeric Powder",  quantityLabel: "½ tsp",        productId: null, note: "Not currently stocked — you likely have this at home" },
      { id: "coriander", name: "Coriander Leaves", quantityLabel: "a small bunch", productId: 1233 },
      { id: "salt",      name: "Salt",             quantityLabel: "to taste",     productId: 2600 },
    ],
    steps: [
      { step: 1, text: "Rinse the toor dal and pressure-cook with turmeric, salt and 3 cups water for 3–4 whistles, until soft and mushy." },
      { step: 2, text: "Whisk the cooked dal smooth and adjust consistency with a little hot water." },
      { step: 3, text: "Heat ghee in a small pan, add cumin seeds and let them sizzle, then add chopped garlic, ginger and green chilli — fry until golden." },
      { step: 4, text: "Add chopped onion and cook until translucent, then chopped tomato until it softens." },
      { step: 5, text: "Pour this tempering over the simmering dal, stir, and simmer together for 3–4 minutes." },
      { step: 6, text: "Garnish with chopped coriander leaves. Serve hot with rice or roti." },
    ],
    nutrition: { calories: 210, protein: 12, carbs: 28, fat: 6 },
  },

  {
    id: "aloo-paratha",
    title: "Aloo Paratha",
    description: "Perfect for breakfast — whole wheat flatbread stuffed with spiced mashed potato, cooked golden in ghee.",
    image:
      "https://images.unsplash.com/photo-1596797038530-2c107229654b?auto=format&fit=crop&w=900&q=80",
    timeMins: 25,
    difficulty: "Medium",
    servings: 4,
    rating: 4.5,
    reviews: 6100,
    cuisine: "North Indian",
    tags: ["Indian", "Vegetarian", "Breakfast", "Under 30 min"],
    ingredients: [
      { id: "potato",   name: "Potato",           quantityLabel: "4 medium",  productId: 502 },
      { id: "atta",     name: "Whole Wheat Atta", quantityLabel: "2 cups",    productId: 2305 },
      { id: "onion",    name: "Onion",            quantityLabel: "1 small",   productId: 889 },
      { id: "chilli",   name: "Green Chilli",     quantityLabel: "2 pieces",  productId: 1064 },
      { id: "coriander",name: "Coriander Leaves", quantityLabel: "a small bunch", productId: 1233 },
      { id: "ghee",     name: "Ghee",             quantityLabel: "for cooking", productId: 2646 },
      { id: "chilli-pw",name: "Red Chilli Powder",quantityLabel: "1 tsp",     productId: null, note: "Not currently stocked — you likely have this at home" },
      { id: "salt",     name: "Salt",             quantityLabel: "to taste",  productId: 2600 },
      { id: "curd",     name: "Curd",             quantityLabel: "for serving", productId: 4550 },
    ],
    steps: [
      { step: 1, text: "Boil the potatoes until fork-tender, peel and mash smooth with no lumps." },
      { step: 2, text: "Mix in finely chopped onion, green chilli, coriander, red chilli powder and salt." },
      { step: 3, text: "Knead the atta into a soft dough with water and a little ghee. Rest 15 minutes." },
      { step: 4, text: "Divide dough and filling into equal portions. Roll a disc, place filling in the centre, seal edges and gently flatten." },
      { step: 5, text: "Roll out carefully into a paratha and cook on a hot tawa with ghee on both sides until golden-brown spots appear." },
      { step: 6, text: "Serve hot with curd, pickle, or butter." },
    ],
    nutrition: { calories: 280, protein: 7, carbs: 42, fat: 10 },
  },

  {
    id: "vegetable-biryani",
    title: "Vegetable Biryani",
    description: "One-pot deliciousness — fragrant basmati rice layered with spiced mixed vegetables and fresh herbs.",
    image:
      "https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=900&q=80",
    timeMins: 40,
    difficulty: "Medium",
    servings: 4,
    rating: 4.6,
    reviews: 5400,
    cuisine: "Indian",
    tags: ["Indian", "Vegetarian", "Dinner"],
    ingredients: [
      { id: "rice",      name: "Basmati Rice",       quantityLabel: "2 cups",  productId: 2389 },
      { id: "carrot",    name: "Carrot",              quantityLabel: "1, diced", productId: 860 },
      { id: "beans",     name: "Beans",               quantityLabel: "handful, chopped", productId: 517 },
      { id: "peas",      name: "Peas",                quantityLabel: "½ cup",   productId: 647 },
      { id: "potato",    name: "Potato",              quantityLabel: "1, diced", productId: 502 },
      { id: "onion",     name: "Onion",               quantityLabel: "2 large, sliced", productId: 889 },
      { id: "capsicum",  name: "Capsicum",            quantityLabel: "1",       productId: 1845 },
      { id: "curd",      name: "Curd",                quantityLabel: "½ cup",   productId: 4550 },
      { id: "ghee",      name: "Ghee",                quantityLabel: "2 tbsp",  productId: 2646 },
      { id: "mint",      name: "Mint Leaves",         quantityLabel: "a handful", productId: 1140 },
      { id: "coriander", name: "Coriander Leaves",    quantityLabel: "a small bunch", productId: 1233 },
      { id: "gg-paste",  name: "Ginger-Garlic Paste", quantityLabel: "1 tbsp",  productId: null, note: "Not currently stocked — you likely have this at home" },
      { id: "biryani-masala", name: "Biryani Masala", quantityLabel: "2 tbsp",  productId: null, note: "Not currently stocked — whole warm spices work as a substitute if you have them" },
      { id: "salt",      name: "Salt",                quantityLabel: "to taste", productId: 2600 },
    ],
    steps: [
      { step: 1, text: "Soak basmati rice for 20 minutes, then par-boil in salted water until 70% cooked. Drain and set aside." },
      { step: 2, text: "Heat ghee, fry sliced onions until deep golden and set half aside for layering." },
      { step: 3, text: "Add ginger-garlic paste to the remaining onions, then all the chopped vegetables and biryani masala. Cook 5–6 minutes." },
      { step: 4, text: "Stir in curd and salt, cook until the vegetables are just tender but not mushy." },
      { step: 5, text: "Layer the parboiled rice over the vegetable masala, top with fried onions, mint and coriander." },
      { step: 6, text: "Cover tightly and cook on the lowest heat (\"dum\") for 15–18 minutes. Rest 5 minutes, then fluff gently before serving." },
    ],
    nutrition: { calories: 380, protein: 9, carbs: 62, fat: 11 },
  },

  {
    id: "chole",
    title: "Chole",
    description: "North Indian classic — chickpeas simmered in a deeply spiced onion-tomato masala.",
    image:
      "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=900&q=80",
    timeMins: 35,
    difficulty: "Medium",
    servings: 4,
    rating: 4.5,
    reviews: 4200,
    cuisine: "North Indian",
    tags: ["Indian", "Vegetarian", "High protein", "Dinner"],
    ingredients: [
      { id: "chickpeas", name: "Chickpeas (Kabuli Chana)", quantityLabel: "1 cup, soaked overnight", productId: null, note: "Not currently stocked — canned chickpeas from your pantry work well too" },
      { id: "onion",     name: "Onion",         quantityLabel: "2 medium",  productId: 889 },
      { id: "tomato",    name: "Tomato",        quantityLabel: "3 medium",  productId: 655 },
      { id: "gg-paste",  name: "Ginger-Garlic Paste", quantityLabel: "1 tbsp", productId: null, note: "Not currently stocked — you likely have this at home" },
      { id: "chilli",    name: "Green Chilli",  quantityLabel: "2 pieces",  productId: 1064 },
      { id: "chole-masala", name: "Chole Masala", quantityLabel: "2 tbsp",  productId: null, note: "Not currently stocked — a mix of any garam spices you have works as a substitute" },
      { id: "oil",       name: "Cooking Oil",   quantityLabel: "3 tbsp",    productId: 2328 },
      { id: "coriander", name: "Coriander Leaves", quantityLabel: "a small bunch", productId: 1233 },
      { id: "salt",      name: "Salt",          quantityLabel: "to taste",  productId: 2600 },
    ],
    steps: [
      { step: 1, text: "Pressure-cook the soaked chickpeas with salt until soft, about 4–5 whistles. Reserve the cooking water." },
      { step: 2, text: "Heat oil, add ginger-garlic paste and chopped green chilli, fry until fragrant." },
      { step: 3, text: "Add finely chopped onion and cook until golden-brown, then chopped tomato and chole masala. Cook until oil separates from the masala." },
      { step: 4, text: "Add the boiled chickpeas along with some of their cooking water. Simmer for 12–15 minutes, mashing a few chickpeas to thicken the gravy." },
      { step: 5, text: "Adjust salt and consistency, garnish with coriander leaves." },
      { step: 6, text: "Serve hot with bhature, puri, or steamed rice." },
    ],
    nutrition: { calories: 290, protein: 13, carbs: 34, fat: 11 },
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

export const getRecipeById = (id: string): Recipe | undefined =>
  RECIPES.find((r) => r.id === id);

export const getAllRecipes = (): Recipe[] => RECIPES;

export const ALL_RECIPE_TAGS = Array.from(
  new Set(RECIPES.flatMap((r) => r.tags))
).sort();

export function searchRecipes(query: string): Recipe[] {
  const q = query.trim().toLowerCase();
  if (!q) return RECIPES;
  return RECIPES.filter((r) =>
    r.title.toLowerCase().includes(q) ||
    r.cuisine.toLowerCase().includes(q) ||
    r.description.toLowerCase().includes(q) ||
    r.tags.some((t) => t.toLowerCase().includes(q)) ||
    r.ingredients.some((i) => i.name.toLowerCase().includes(q))
  );
}

export function filterRecipesByTag(tag: string): Recipe[] {
  return RECIPES.filter((r) => r.tags.includes(tag));
}

/** Resolves an ingredient's real catalogue product, if it has one. */
export function resolveIngredientProduct(ing: RecipeIngredient): Product | undefined {
  return ing.productId != null ? getById(ing.productId) : undefined;
}

export function isIngredientAvailable(ing: RecipeIngredient): boolean {
  return ing.productId != null && resolveIngredientProduct(ing) != null;
}

/** "You may also like" — a few other recipes, preferring the same cuisine. */
export function relatedRecipes(recipe: Recipe, n = 3): Recipe[] {
  const rest = RECIPES.filter((r) => r.id !== recipe.id);
  const sameCuisine = rest.filter((r) => r.cuisine === recipe.cuisine);
  const rest2 = rest.filter((r) => r.cuisine !== recipe.cuisine);
  return [...sameCuisine, ...rest2].slice(0, n);
}

/**
 * Reverse flow (Screen 9): given ingredient names the user says they have,
 * rank recipes by how many of their ingredients are covered. A simple
 * substring match against ingredient names — good enough for a curated
 * recipe set like this one, not a full NLP pantry-matcher.
 */
export interface RecipeCoverage {
  recipe: Recipe;
  haveCount: number;
  totalCount: number;
  missing: RecipeIngredient[];
}

export function matchRecipesToPantry(haveNames: string[]): RecipeCoverage[] {
  const have = haveNames.map((n) => n.trim().toLowerCase()).filter(Boolean);
  if (have.length === 0) return [];

  return RECIPES
    .map((recipe) => {
      const missing: RecipeIngredient[] = [];
      let haveCount = 0;
      for (const ing of recipe.ingredients) {
        const nameLower = ing.name.toLowerCase();
        const covered = have.some(
          (h) => nameLower.includes(h) || h.includes(nameLower)
        );
        if (covered) haveCount += 1;
        else missing.push(ing);
      }
      return { recipe, haveCount, totalCount: recipe.ingredients.length, missing };
    })
    .filter((c) => c.haveCount > 0)
    .sort((a, b) => b.haveCount / b.totalCount - a.haveCount / a.totalCount);
}

// Common pantry ingredient chips for the "From Ingredients" page.
export const COMMON_PANTRY_INGREDIENTS = [
  "Tomato", "Onion", "Potato", "Paneer", "Garlic", "Ginger",
  "Green Chilli", "Rice", "Toor Dal", "Curd", "Butter", "Coriander Leaves",
];
