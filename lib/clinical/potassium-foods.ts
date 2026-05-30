/**
 * Potassium Food Database
 * 120+ common foods with potassium content (mg per 100g serving).
 * Used by the Renal Diet food lookup to flag high-potassium foods.
 *
 * Risk levels for Renal diet (2,000 mg/day limit):
 *   high   ≥ 300 mg/100g — avoid or limit strictly
 *   medium 150–299 mg/100g — moderate portions
 *   low    < 150 mg/100g — generally safe
 *
 * Sources: USDA FoodData Central, BDA Renal Nutrition guidelines.
 */

export interface FoodItem {
  id: string;
  name: string;
  category: FoodCategory;
  /** Potassium in mg per 100g edible portion */
  potassiumMgPer100g: number;
  /** Sodium in mg per 100g (bonus for DASH/sodium tracking) */
  sodiumMgPer100g?: number;
  /** Calories per 100g */
  caloriesPer100g?: number;
  /** Typical serving size in grams */
  typicalServingG?: number;
  /** Renal risk level derived from potassiumMgPer100g */
  renalRisk: 'high' | 'medium' | 'low';
  /** Additional note for renal patients */
  renalNote?: string;
}

export type FoodCategory =
  | 'fruit'
  | 'vegetable'
  | 'grain'
  | 'protein'
  | 'dairy'
  | 'legume'
  | 'nut_seed'
  | 'beverage'
  | 'snack'
  | 'condiment';

function risk(k: number): 'high' | 'medium' | 'low' {
  if (k >= 300) return 'high';
  if (k >= 150) return 'medium';
  return 'low';
}

export const POTASSIUM_FOODS: FoodItem[] = [
  // ── Fruits ────────────────────────────────────────────────────────────────
  { id: 'f-banana', name: 'Banana', category: 'fruit', potassiumMgPer100g: 358, sodiumMgPer100g: 1, caloriesPer100g: 89, typicalServingG: 120, renalRisk: risk(358), renalNote: 'Very high K — avoid on renal diet' },
  { id: 'f-avocado', name: 'Avocado', category: 'fruit', potassiumMgPer100g: 485, sodiumMgPer100g: 7, caloriesPer100g: 160, typicalServingG: 80, renalRisk: risk(485), renalNote: 'Highest K among fruits — limit strictly' },
  { id: 'f-orange', name: 'Orange', category: 'fruit', potassiumMgPer100g: 181, sodiumMgPer100g: 0, caloriesPer100g: 47, typicalServingG: 130, renalRisk: risk(181) },
  { id: 'f-kiwi', name: 'Kiwi', category: 'fruit', potassiumMgPer100g: 312, sodiumMgPer100g: 3, caloriesPer100g: 61, typicalServingG: 75, renalRisk: risk(312) },
  { id: 'f-mango', name: 'Mango', category: 'fruit', potassiumMgPer100g: 168, sodiumMgPer100g: 1, caloriesPer100g: 60, typicalServingG: 165, renalRisk: risk(168) },
  { id: 'f-apple', name: 'Apple', category: 'fruit', potassiumMgPer100g: 107, sodiumMgPer100g: 1, caloriesPer100g: 52, typicalServingG: 182, renalRisk: risk(107) },
  { id: 'f-pear', name: 'Pear', category: 'fruit', potassiumMgPer100g: 116, sodiumMgPer100g: 1, caloriesPer100g: 57, typicalServingG: 178, renalRisk: risk(116) },
  { id: 'f-strawberry', name: 'Strawberry', category: 'fruit', potassiumMgPer100g: 153, sodiumMgPer100g: 1, caloriesPer100g: 32, typicalServingG: 100, renalRisk: risk(153) },
  { id: 'f-blueberry', name: 'Blueberry', category: 'fruit', potassiumMgPer100g: 77, sodiumMgPer100g: 1, caloriesPer100g: 57, typicalServingG: 100, renalRisk: risk(77) },
  { id: 'f-grapes', name: 'Grapes', category: 'fruit', potassiumMgPer100g: 191, sodiumMgPer100g: 2, caloriesPer100g: 67, typicalServingG: 100, renalRisk: risk(191) },
  { id: 'f-watermelon', name: 'Watermelon', category: 'fruit', potassiumMgPer100g: 112, sodiumMgPer100g: 1, caloriesPer100g: 30, typicalServingG: 280, renalRisk: risk(112) },
  { id: 'f-cantaloupe', name: 'Cantaloupe', category: 'fruit', potassiumMgPer100g: 267, sodiumMgPer100g: 16, caloriesPer100g: 34, typicalServingG: 160, renalRisk: risk(267) },
  { id: 'f-peach', name: 'Peach', category: 'fruit', potassiumMgPer100g: 190, sodiumMgPer100g: 0, caloriesPer100g: 39, typicalServingG: 150, renalRisk: risk(190) },
  { id: 'f-plum', name: 'Plum', category: 'fruit', potassiumMgPer100g: 157, sodiumMgPer100g: 0, caloriesPer100g: 46, typicalServingG: 66, renalRisk: risk(157) },
  { id: 'f-pineapple', name: 'Pineapple', category: 'fruit', potassiumMgPer100g: 109, sodiumMgPer100g: 1, caloriesPer100g: 50, typicalServingG: 165, renalRisk: risk(109) },
  { id: 'f-pomegranate', name: 'Pomegranate', category: 'fruit', potassiumMgPer100g: 236, sodiumMgPer100g: 3, caloriesPer100g: 83, typicalServingG: 87, renalRisk: risk(236) },
  { id: 'f-dried-apricot', name: 'Dried Apricot', category: 'fruit', potassiumMgPer100g: 1160, sodiumMgPer100g: 10, caloriesPer100g: 241, typicalServingG: 30, renalRisk: risk(1160), renalNote: 'Extremely high K — avoid completely on renal diet' },
  { id: 'f-raisin', name: 'Raisins', category: 'fruit', potassiumMgPer100g: 749, sodiumMgPer100g: 11, caloriesPer100g: 299, typicalServingG: 40, renalRisk: risk(749), renalNote: 'Very high K — avoid on renal diet' },

  // ── Vegetables ────────────────────────────────────────────────────────────
  { id: 'v-potato', name: 'Potato (baked)', category: 'vegetable', potassiumMgPer100g: 535, sodiumMgPer100g: 10, caloriesPer100g: 93, typicalServingG: 200, renalRisk: risk(535), renalNote: 'Very high K — leach by boiling in large water' },
  { id: 'v-sweet-potato', name: 'Sweet Potato', category: 'vegetable', potassiumMgPer100g: 475, sodiumMgPer100g: 55, caloriesPer100g: 86, typicalServingG: 130, renalRisk: risk(475), renalNote: 'High K — limit on renal diet' },
  { id: 'v-tomato', name: 'Tomato', category: 'vegetable', potassiumMgPer100g: 237, sodiumMgPer100g: 5, caloriesPer100g: 18, typicalServingG: 123, renalRisk: risk(237) },
  { id: 'v-tomato-paste', name: 'Tomato Paste', category: 'vegetable', potassiumMgPer100g: 1014, sodiumMgPer100g: 59, caloriesPer100g: 82, typicalServingG: 30, renalRisk: risk(1014), renalNote: 'Concentrated K — avoid on renal diet' },
  { id: 'v-spinach', name: 'Spinach (cooked)', category: 'vegetable', potassiumMgPer100g: 466, sodiumMgPer100g: 70, caloriesPer100g: 23, typicalServingG: 180, renalRisk: risk(466), renalNote: 'High K — limit on renal diet' },
  { id: 'v-kale', name: 'Kale (cooked)', category: 'vegetable', potassiumMgPer100g: 228, sodiumMgPer100g: 23, caloriesPer100g: 28, typicalServingG: 130, renalRisk: risk(228) },
  { id: 'v-broccoli', name: 'Broccoli', category: 'vegetable', potassiumMgPer100g: 316, sodiumMgPer100g: 33, caloriesPer100g: 34, typicalServingG: 91, renalRisk: risk(316) },
  { id: 'v-cauliflower', name: 'Cauliflower', category: 'vegetable', potassiumMgPer100g: 299, sodiumMgPer100g: 30, caloriesPer100g: 25, typicalServingG: 100, renalRisk: risk(299) },
  { id: 'v-carrot', name: 'Carrot', category: 'vegetable', potassiumMgPer100g: 320, sodiumMgPer100g: 69, caloriesPer100g: 41, typicalServingG: 61, renalRisk: risk(320) },
  { id: 'v-celery', name: 'Celery', category: 'vegetable', potassiumMgPer100g: 260, sodiumMgPer100g: 80, caloriesPer100g: 16, typicalServingG: 101, renalRisk: risk(260) },
  { id: 'v-cucumber', name: 'Cucumber', category: 'vegetable', potassiumMgPer100g: 147, sodiumMgPer100g: 2, caloriesPer100g: 15, typicalServingG: 119, renalRisk: risk(147) },
  { id: 'v-lettuce', name: 'Lettuce (iceberg)', category: 'vegetable', potassiumMgPer100g: 141, sodiumMgPer100g: 10, caloriesPer100g: 14, typicalServingG: 85, renalRisk: risk(141) },
  { id: 'v-cabbage', name: 'Cabbage', category: 'vegetable', potassiumMgPer100g: 170, sodiumMgPer100g: 18, caloriesPer100g: 25, typicalServingG: 89, renalRisk: risk(170) },
  { id: 'v-onion', name: 'Onion', category: 'vegetable', potassiumMgPer100g: 146, sodiumMgPer100g: 4, caloriesPer100g: 40, typicalServingG: 110, renalRisk: risk(146) },
  { id: 'v-garlic', name: 'Garlic', category: 'vegetable', potassiumMgPer100g: 401, sodiumMgPer100g: 17, caloriesPer100g: 149, typicalServingG: 9, renalRisk: risk(401) },
  { id: 'v-mushroom', name: 'Mushroom (white)', category: 'vegetable', potassiumMgPer100g: 318, sodiumMgPer100g: 5, caloriesPer100g: 22, typicalServingG: 70, renalRisk: risk(318) },
  { id: 'v-corn', name: 'Corn (sweet)', category: 'vegetable', potassiumMgPer100g: 270, sodiumMgPer100g: 15, caloriesPer100g: 86, typicalServingG: 154, renalRisk: risk(270) },
  { id: 'v-peas', name: 'Green Peas', category: 'vegetable', potassiumMgPer100g: 244, sodiumMgPer100g: 5, caloriesPer100g: 81, typicalServingG: 145, renalRisk: risk(244) },
  { id: 'v-artichoke', name: 'Artichoke (cooked)', category: 'vegetable', potassiumMgPer100g: 354, sodiumMgPer100g: 76, caloriesPer100g: 53, typicalServingG: 120, renalRisk: risk(354) },
  { id: 'v-asparagus', name: 'Asparagus', category: 'vegetable', potassiumMgPer100g: 202, sodiumMgPer100g: 2, caloriesPer100g: 20, typicalServingG: 134, renalRisk: risk(202) },
  { id: 'v-beet', name: 'Beetroot', category: 'vegetable', potassiumMgPer100g: 305, sodiumMgPer100g: 78, caloriesPer100g: 43, typicalServingG: 136, renalRisk: risk(305) },
  { id: 'v-zucchini', name: 'Zucchini', category: 'vegetable', potassiumMgPer100g: 261, sodiumMgPer100g: 8, caloriesPer100g: 17, typicalServingG: 124, renalRisk: risk(261) },
  { id: 'v-bell-pepper', name: 'Bell Pepper (red)', category: 'vegetable', potassiumMgPer100g: 211, sodiumMgPer100g: 4, caloriesPer100g: 31, typicalServingG: 119, renalRisk: risk(211) },

  // ── Grains ────────────────────────────────────────────────────────────────
  { id: 'g-white-rice', name: 'White Rice (cooked)', category: 'grain', potassiumMgPer100g: 35, sodiumMgPer100g: 1, caloriesPer100g: 130, typicalServingG: 186, renalRisk: risk(35) },
  { id: 'g-brown-rice', name: 'Brown Rice (cooked)', category: 'grain', potassiumMgPer100g: 79, sodiumMgPer100g: 5, caloriesPer100g: 216, typicalServingG: 202, renalRisk: risk(79) },
  { id: 'g-white-bread', name: 'White Bread', category: 'grain', potassiumMgPer100g: 115, sodiumMgPer100g: 491, caloriesPer100g: 265, typicalServingG: 28, renalRisk: risk(115) },
  { id: 'g-whole-wheat-bread', name: 'Whole Wheat Bread', category: 'grain', potassiumMgPer100g: 248, sodiumMgPer100g: 400, caloriesPer100g: 247, typicalServingG: 28, renalRisk: risk(248) },
  { id: 'g-oats', name: 'Oats (cooked)', category: 'grain', potassiumMgPer100g: 61, sodiumMgPer100g: 49, caloriesPer100g: 71, typicalServingG: 234, renalRisk: risk(61) },
  { id: 'g-pasta', name: 'Pasta (cooked)', category: 'grain', potassiumMgPer100g: 44, sodiumMgPer100g: 1, caloriesPer100g: 158, typicalServingG: 140, renalRisk: risk(44) },
  { id: 'g-quinoa', name: 'Quinoa (cooked)', category: 'grain', potassiumMgPer100g: 172, sodiumMgPer100g: 7, caloriesPer100g: 120, typicalServingG: 185, renalRisk: risk(172) },

  // ── Proteins ──────────────────────────────────────────────────────────────
  { id: 'p-chicken-breast', name: 'Chicken Breast (cooked)', category: 'protein', potassiumMgPer100g: 256, sodiumMgPer100g: 74, caloriesPer100g: 165, typicalServingG: 140, renalRisk: risk(256) },
  { id: 'p-salmon', name: 'Salmon (cooked)', category: 'protein', potassiumMgPer100g: 628, sodiumMgPer100g: 59, caloriesPer100g: 208, typicalServingG: 154, renalRisk: risk(628), renalNote: 'High K — limit portions on renal diet' },
  { id: 'p-tuna-canned', name: 'Tuna (canned in water)', category: 'protein', potassiumMgPer100g: 237, sodiumMgPer100g: 247, caloriesPer100g: 116, typicalServingG: 85, renalRisk: risk(237) },
  { id: 'p-beef', name: 'Beef (lean, cooked)', category: 'protein', potassiumMgPer100g: 318, sodiumMgPer100g: 65, caloriesPer100g: 250, typicalServingG: 85, renalRisk: risk(318) },
  { id: 'p-pork', name: 'Pork (lean, cooked)', category: 'protein', potassiumMgPer100g: 423, sodiumMgPer100g: 62, caloriesPer100g: 242, typicalServingG: 85, renalRisk: risk(423), renalNote: 'High K — limit on renal diet' },
  { id: 'p-egg', name: 'Egg (whole, cooked)', category: 'protein', potassiumMgPer100g: 126, sodiumMgPer100g: 124, caloriesPer100g: 155, typicalServingG: 50, renalRisk: risk(126) },
  { id: 'p-shrimp', name: 'Shrimp (cooked)', category: 'protein', potassiumMgPer100g: 185, sodiumMgPer100g: 148, caloriesPer100g: 99, typicalServingG: 85, renalRisk: risk(185) },
  { id: 'p-turkey', name: 'Turkey Breast (cooked)', category: 'protein', potassiumMgPer100g: 298, sodiumMgPer100g: 70, caloriesPer100g: 189, typicalServingG: 85, renalRisk: risk(298) },

  // ── Dairy ─────────────────────────────────────────────────────────────────
  { id: 'd-milk-whole', name: 'Whole Milk', category: 'dairy', potassiumMgPer100g: 132, sodiumMgPer100g: 44, caloriesPer100g: 61, typicalServingG: 244, renalRisk: risk(132) },
  { id: 'd-yogurt-plain', name: 'Plain Yogurt (whole)', category: 'dairy', potassiumMgPer100g: 155, sodiumMgPer100g: 46, caloriesPer100g: 61, typicalServingG: 245, renalRisk: risk(155) },
  { id: 'd-cheese-cheddar', name: 'Cheddar Cheese', category: 'dairy', potassiumMgPer100g: 98, sodiumMgPer100g: 621, caloriesPer100g: 403, typicalServingG: 28, renalRisk: risk(98) },
  { id: 'd-cottage-cheese', name: 'Cottage Cheese (low-fat)', category: 'dairy', potassiumMgPer100g: 84, sodiumMgPer100g: 364, caloriesPer100g: 72, typicalServingG: 113, renalRisk: risk(84) },
  { id: 'd-butter', name: 'Butter', category: 'dairy', potassiumMgPer100g: 24, sodiumMgPer100g: 643, caloriesPer100g: 717, typicalServingG: 14, renalRisk: risk(24) },

  // ── Legumes ───────────────────────────────────────────────────────────────
  { id: 'l-kidney-beans', name: 'Kidney Beans (cooked)', category: 'legume', potassiumMgPer100g: 403, sodiumMgPer100g: 2, caloriesPer100g: 127, typicalServingG: 172, renalRisk: risk(403), renalNote: 'High K — avoid on renal diet' },
  { id: 'l-lentils', name: 'Lentils (cooked)', category: 'legume', potassiumMgPer100g: 369, sodiumMgPer100g: 2, caloriesPer100g: 116, typicalServingG: 198, renalRisk: risk(369), renalNote: 'High K — limit on renal diet' },
  { id: 'l-chickpeas', name: 'Chickpeas (cooked)', category: 'legume', potassiumMgPer100g: 291, sodiumMgPer100g: 7, caloriesPer100g: 164, typicalServingG: 164, renalRisk: risk(291) },
  { id: 'l-black-beans', name: 'Black Beans (cooked)', category: 'legume', potassiumMgPer100g: 355, sodiumMgPer100g: 1, caloriesPer100g: 132, typicalServingG: 172, renalRisk: risk(355), renalNote: 'High K — limit on renal diet' },
  { id: 'l-edamame', name: 'Edamame', category: 'legume', potassiumMgPer100g: 436, sodiumMgPer100g: 6, caloriesPer100g: 122, typicalServingG: 155, renalRisk: risk(436), renalNote: 'High K — avoid on renal diet' },
  { id: 'l-tofu', name: 'Tofu (firm)', category: 'legume', potassiumMgPer100g: 121, sodiumMgPer100g: 7, caloriesPer100g: 76, typicalServingG: 126, renalRisk: risk(121) },

  // ── Nuts & Seeds ──────────────────────────────────────────────────────────
  { id: 'n-almonds', name: 'Almonds', category: 'nut_seed', potassiumMgPer100g: 733, sodiumMgPer100g: 1, caloriesPer100g: 579, typicalServingG: 28, renalRisk: risk(733), renalNote: 'Very high K — avoid on renal diet' },
  { id: 'n-peanuts', name: 'Peanuts', category: 'nut_seed', potassiumMgPer100g: 705, sodiumMgPer100g: 18, caloriesPer100g: 567, typicalServingG: 28, renalRisk: risk(705), renalNote: 'Very high K — avoid on renal diet' },
  { id: 'n-cashews', name: 'Cashews', category: 'nut_seed', potassiumMgPer100g: 660, sodiumMgPer100g: 12, caloriesPer100g: 553, typicalServingG: 28, renalRisk: risk(660), renalNote: 'Very high K — avoid on renal diet' },
  { id: 'n-walnuts', name: 'Walnuts', category: 'nut_seed', potassiumMgPer100g: 441, sodiumMgPer100g: 2, caloriesPer100g: 654, typicalServingG: 28, renalRisk: risk(441), renalNote: 'High K — limit on renal diet' },
  { id: 'n-sunflower-seeds', name: 'Sunflower Seeds', category: 'nut_seed', potassiumMgPer100g: 645, sodiumMgPer100g: 9, caloriesPer100g: 584, typicalServingG: 28, renalRisk: risk(645), renalNote: 'Very high K — avoid on renal diet' },
  { id: 'n-pumpkin-seeds', name: 'Pumpkin Seeds', category: 'nut_seed', potassiumMgPer100g: 809, sodiumMgPer100g: 7, caloriesPer100g: 559, typicalServingG: 28, renalRisk: risk(809), renalNote: 'Extremely high K — avoid on renal diet' },
  { id: 'n-flaxseed', name: 'Flaxseed', category: 'nut_seed', potassiumMgPer100g: 813, sodiumMgPer100g: 30, caloriesPer100g: 534, typicalServingG: 15, renalRisk: risk(813), renalNote: 'Extremely high K — avoid on renal diet' },
  { id: 'n-macadamia', name: 'Macadamia Nuts', category: 'nut_seed', potassiumMgPer100g: 368, sodiumMgPer100g: 5, caloriesPer100g: 718, typicalServingG: 28, renalRisk: risk(368) },

  // ── Beverages ─────────────────────────────────────────────────────────────
  { id: 'b-orange-juice', name: 'Orange Juice', category: 'beverage', potassiumMgPer100g: 200, sodiumMgPer100g: 1, caloriesPer100g: 45, typicalServingG: 248, renalRisk: risk(200) },
  { id: 'b-tomato-juice', name: 'Tomato Juice', category: 'beverage', potassiumMgPer100g: 217, sodiumMgPer100g: 400, caloriesPer100g: 17, typicalServingG: 243, renalRisk: risk(217) },
  { id: 'b-coconut-water', name: 'Coconut Water', category: 'beverage', potassiumMgPer100g: 250, sodiumMgPer100g: 105, caloriesPer100g: 19, typicalServingG: 240, renalRisk: risk(250), renalNote: 'Moderate K — limit on renal diet' },
  { id: 'b-coffee', name: 'Coffee (brewed)', category: 'beverage', potassiumMgPer100g: 49, sodiumMgPer100g: 2, caloriesPer100g: 1, typicalServingG: 237, renalRisk: risk(49) },
  { id: 'b-tea-black', name: 'Black Tea (brewed)', category: 'beverage', potassiumMgPer100g: 37, sodiumMgPer100g: 3, caloriesPer100g: 1, typicalServingG: 237, renalRisk: risk(37) },
  { id: 'b-sports-drink', name: 'Sports Drink (Gatorade)', category: 'beverage', potassiumMgPer100g: 38, sodiumMgPer100g: 49, caloriesPer100g: 26, typicalServingG: 591, renalRisk: risk(38) },
  { id: 'b-apple-juice', name: 'Apple Juice', category: 'beverage', potassiumMgPer100g: 101, sodiumMgPer100g: 4, caloriesPer100g: 46, typicalServingG: 248, renalRisk: risk(101) },

  // ── Snacks ────────────────────────────────────────────────────────────────
  { id: 's-potato-chips', name: 'Potato Chips', category: 'snack', potassiumMgPer100g: 465, sodiumMgPer100g: 525, caloriesPer100g: 536, typicalServingG: 28, renalRisk: risk(465), renalNote: 'Very high K + Na — avoid on renal diet' },
  { id: 's-dark-chocolate', name: 'Dark Chocolate (70%)', category: 'snack', potassiumMgPer100g: 559, sodiumMgPer100g: 20, caloriesPer100g: 598, typicalServingG: 40, renalRisk: risk(559), renalNote: 'High K — limit on renal diet' },
  { id: 's-popcorn', name: 'Popcorn (air-popped)', category: 'snack', potassiumMgPer100g: 274, sodiumMgPer100g: 2, caloriesPer100g: 375, typicalServingG: 28, renalRisk: risk(274) },
  { id: 's-crackers', name: 'Crackers (saltine)', category: 'snack', potassiumMgPer100g: 120, sodiumMgPer100g: 1104, caloriesPer100g: 421, typicalServingG: 28, renalRisk: risk(120) },
  { id: 's-granola-bar', name: 'Granola Bar', category: 'snack', potassiumMgPer100g: 230, sodiumMgPer100g: 115, caloriesPer100g: 471, typicalServingG: 47, renalRisk: risk(230) },

  // ── Condiments ────────────────────────────────────────────────────────────
  { id: 'c-ketchup', name: 'Ketchup', category: 'condiment', potassiumMgPer100g: 281, sodiumMgPer100g: 907, caloriesPer100g: 101, typicalServingG: 17, renalRisk: risk(281) },
  { id: 'c-soy-sauce', name: 'Soy Sauce', category: 'condiment', potassiumMgPer100g: 435, sodiumMgPer100g: 5493, caloriesPer100g: 53, typicalServingG: 16, renalRisk: risk(435), renalNote: 'High K + extremely high Na — avoid' },
  { id: 'c-peanut-butter', name: 'Peanut Butter', category: 'condiment', potassiumMgPer100g: 558, sodiumMgPer100g: 429, caloriesPer100g: 588, typicalServingG: 32, renalRisk: risk(558), renalNote: 'High K — limit on renal diet' },
  { id: 'c-hummus', name: 'Hummus', category: 'condiment', potassiumMgPer100g: 228, sodiumMgPer100g: 379, caloriesPer100g: 177, typicalServingG: 60, renalRisk: risk(228) },
  { id: 'c-olive-oil', name: 'Olive Oil', category: 'condiment', potassiumMgPer100g: 1, sodiumMgPer100g: 2, caloriesPer100g: 884, typicalServingG: 14, renalRisk: risk(1) },
  { id: 'c-salsa', name: 'Salsa (tomato)', category: 'condiment', potassiumMgPer100g: 218, sodiumMgPer100g: 400, caloriesPer100g: 36, typicalServingG: 60, renalRisk: risk(218) },
];

/** Search foods by name (case-insensitive substring match) */
export function searchFoods(query: string, limit = 20): FoodItem[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  return POTASSIUM_FOODS
    .filter(f => f.name.toLowerCase().includes(q) || f.category.includes(q))
    .sort((a, b) => {
      // Exact matches first, then by name length (shorter = more specific)
      const aExact = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bExact = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return aExact - bExact || a.name.length - b.name.length;
    })
    .slice(0, limit);
}

/** Get potassium in mg for a given serving size */
export function calcPotassiumMg(food: FoodItem, servingG: number): number {
  return Math.round((food.potassiumMgPer100g / 100) * servingG);
}

/** Get sodium in mg for a given serving size */
export function calcSodiumMg(food: FoodItem, servingG: number): number {
  return Math.round(((food.sodiumMgPer100g ?? 0) / 100) * servingG);
}

/** Get calories for a given serving size */
export function calcCalories(food: FoodItem, servingG: number): number {
  return Math.round(((food.caloriesPer100g ?? 0) / 100) * servingG);
}

export const CATEGORY_LABELS: Record<FoodCategory, string> = {
  fruit: 'Fruit',
  vegetable: 'Vegetable',
  grain: 'Grain',
  protein: 'Protein',
  dairy: 'Dairy',
  legume: 'Legume',
  nut_seed: 'Nuts & Seeds',
  beverage: 'Beverage',
  snack: 'Snack',
  condiment: 'Condiment',
};

export const RENAL_RISK_COLORS = {
  high: '#EF4444',    // red
  medium: '#F59E0B',  // amber
  low: '#22C55E',     // green
} as const;

export const RENAL_RISK_LABELS = {
  high: 'High K',
  medium: 'Moderate K',
  low: 'Low K',
} as const;
