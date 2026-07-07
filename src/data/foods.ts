// ─────────────────────────────────────────────────────────────────────────────
// Seed food database — extracted 1:1 from `food_macros_uz.pdf`.
// 117 items, 10 categories. Macros are PER PORTION (`refGrams` grams/ml).
// This file is pure data (no browser APIs) so the serverless functions in
// /api can import it too (for the voice-parsing prompt).
//
// NOTE: one typo fixed from the PDF: "Tuna (tuxum suvida)" → "Tuna (tuz
// suvida)" (canned in brine). All numeric values are unchanged.
// ─────────────────────────────────────────────────────────────────────────────

export type CategoryId =
  | 'gosht'
  | 'baliq'
  | 'sut'
  | 'non'
  | 'dukkak'
  | 'yogliklar'
  | 'sabzavot'
  | 'taomlar'
  | 'shirinlik'
  | 'ichimlik';

export interface Category {
  id: CategoryId;
  nameUz: string;
  nameEn: string;
  emoji: string;
}

export const CATEGORIES: Category[] = [
  { id: 'gosht', nameUz: "Go'sht va parranda", nameEn: 'Meat & Poultry', emoji: '🥩' },
  { id: 'baliq', nameUz: 'Baliq va tuxum', nameEn: 'Fish & Eggs', emoji: '🐟' },
  { id: 'sut', nameUz: 'Sut mahsulotlari', nameEn: 'Dairy', emoji: '🥛' },
  { id: 'non', nameUz: 'Non, guruch, kartoshka', nameEn: 'Grains & Starches', emoji: '🍚' },
  { id: 'dukkak', nameUz: 'Dukkaklilar', nameEn: 'Legumes', emoji: '🫘' },
  { id: 'yogliklar', nameUz: "Yong'oq va yog'lar", nameEn: 'Nuts & Fats', emoji: '🥜' },
  { id: 'sabzavot', nameUz: 'Sabzavot va mevalar', nameEn: 'Vegetables & Fruit', emoji: '🥗' },
  { id: 'taomlar', nameUz: "An'anaviy taomlar", nameEn: 'Traditional Dishes', emoji: '🍲' },
  { id: 'shirinlik', nameUz: 'Shirinliklar', nameEn: 'Snacks & Sweets', emoji: '🍫' },
  { id: 'ichimlik', nameUz: 'Ichimliklar', nameEn: 'Drinks', emoji: '🥤' },
];

export interface FoodItem {
  /** Stable id — referenced by log entries, favorites and meal templates. */
  id: string;
  category: CategoryId;
  nameUz: string;
  nameEn: string;
  /** Human portion label as printed in the PDF, e.g. "1 dona (~55 g)". */
  portionLabel: string;
  /** Grams (or ml) that the macro values below refer to. */
  refGrams: number;
  /** Per-portion values, exactly as in the PDF. */
  kcal: number;
  p: number;
  f: number;
  c: number;
}

export const FOODS: FoodItem[] = [
  // ── Go'sht va parranda — Meat & Poultry (cooked) — 9 items ────────────────
  { id: 'mol-yogsiz', category: 'gosht', nameUz: "Mol go'shti, yog'siz", nameEn: 'Lean beef', portionLabel: '100 g', refGrams: 100, kcal: 190, p: 29, f: 8, c: 0 },
  { id: 'mol-ortacha', category: 'gosht', nameUz: "Mol go'shti, o'rtacha yog'li", nameEn: 'Beef, medium-fat', portionLabel: '100 g', refGrams: 100, kcal: 250, p: 26, f: 17, c: 0 },
  { id: 'qoy-goshti', category: 'gosht', nameUz: "Qo'y go'shti", nameEn: 'Lamb / mutton', portionLabel: '100 g', refGrams: 100, kcal: 258, p: 25, f: 17, c: 0 },
  { id: 'tovuq-kokragi', category: 'gosht', nameUz: "Tovuq ko'kragi", nameEn: 'Chicken breast, skinless', portionLabel: '100 g', refGrams: 100, kcal: 165, p: 31, f: 3.6, c: 0 },
  { id: 'tovuq-son', category: 'gosht', nameUz: 'Tovuq son', nameEn: 'Chicken thigh, skinless', portionLabel: '100 g', refGrams: 100, kcal: 209, p: 26, f: 11, c: 0 },
  { id: 'tovuq-teri', category: 'gosht', nameUz: 'Tovuq, butun teri bilan', nameEn: 'Whole chicken, with skin', portionLabel: '100 g', refGrams: 100, kcal: 239, p: 27, f: 14, c: 0 },
  { id: 'kurka', category: 'gosht', nameUz: 'Kurka', nameEn: 'Turkey breast', portionLabel: '100 g', refGrams: 100, kcal: 135, p: 30, f: 1, c: 0 },
  { id: 'jigar', category: 'gosht', nameUz: 'Jigar', nameEn: 'Beef liver', portionLabel: '100 g', refGrams: 100, kcal: 175, p: 27, f: 5, c: 4 },
  { id: 'qiyma', category: 'gosht', nameUz: 'Qiyma', nameEn: 'Minced beef (~15% fat)', portionLabel: '100 g', refGrams: 100, kcal: 250, p: 26, f: 17, c: 0 },

  // ── Baliq va tuxum — Fish & Eggs — 8 items ────────────────────────────────
  { id: 'losos', category: 'baliq', nameUz: 'Losos / qizil baliq', nameEn: 'Salmon', portionLabel: '100 g', refGrams: 100, kcal: 208, p: 20, f: 13, c: 0 },
  { id: 'skumbriya', category: 'baliq', nameUz: 'Skumbriya', nameEn: 'Mackerel', portionLabel: '100 g', refGrams: 100, kcal: 205, p: 19, f: 14, c: 0 },
  { id: 'sardina', category: 'baliq', nameUz: 'Sardina', nameEn: 'Sardine', portionLabel: '100 g', refGrams: 100, kcal: 208, p: 25, f: 11, c: 0 },
  { id: 'tuna', category: 'baliq', nameUz: 'Tuna (tuz suvida)', nameEn: 'Tuna, canned in brine', portionLabel: '100 g', refGrams: 100, kcal: 116, p: 26, f: 1, c: 0 },
  { id: 'oq-baliq', category: 'baliq', nameUz: 'Oq baliq', nameEn: 'White fish (e.g. cod)', portionLabel: '100 g', refGrams: 100, kcal: 90, p: 20, f: 1, c: 0 },
  { id: 'tuxum', category: 'baliq', nameUz: 'Tovuq tuxumi', nameEn: 'Whole egg', portionLabel: '1 dona (~55 g)', refGrams: 55, kcal: 78, p: 6.3, f: 5.3, c: 0.6 },
  { id: 'tuxum-oqi', category: 'baliq', nameUz: 'Tuxum oqi', nameEn: 'Egg white', portionLabel: '1 dona (~33 g)', refGrams: 33, kcal: 17, p: 3.6, f: 0, c: 0.2 },
  { id: 'bedana-tuxumi', category: 'baliq', nameUz: 'Bedana tuxumi', nameEn: 'Quail egg', portionLabel: '1 dona (~9 g)', refGrams: 9, kcal: 14, p: 1.2, f: 1.0, c: 0.04 },

  // ── Sut mahsulotlari — Dairy — 11 items ───────────────────────────────────
  { id: 'sut-yogli', category: 'sut', nameUz: "Sut, yog'li 3.2%", nameEn: 'Whole milk', portionLabel: '250 ml', refGrams: 250, kcal: 150, p: 8, f: 8, c: 12 },
  { id: 'sut-kam', category: 'sut', nameUz: "Sut, kam yog'li 1%", nameEn: 'Low-fat milk', portionLabel: '250 ml', refGrams: 250, kcal: 105, p: 8, f: 2.5, c: 12 },
  { id: 'tvorog', category: 'sut', nameUz: "Tvorog, kam yog'li", nameEn: 'Low-fat cottage cheese', portionLabel: '100 g', refGrams: 100, kcal: 98, p: 18, f: 3, c: 3 },
  { id: 'qatiq', category: 'sut', nameUz: 'Qatiq / yogurt, sodda', nameEn: 'Plain yogurt', portionLabel: '100 g', refGrams: 100, kcal: 60, p: 3.5, f: 3, c: 5 },
  { id: 'yunon-yogurti', category: 'sut', nameUz: 'Yunon yogurti', nameEn: 'Greek yogurt, plain', portionLabel: '100 g', refGrams: 100, kcal: 59, p: 10, f: 0.4, c: 3.6 },
  { id: 'pishloq', category: 'sut', nameUz: 'Pishloq', nameEn: 'Hard cheese', portionLabel: '100 g', refGrams: 100, kcal: 400, p: 25, f: 33, c: 1.3 },
  { id: 'suzma', category: 'sut', nameUz: 'Suzma', nameEn: 'Strained yogurt', portionLabel: '100 g', refGrams: 100, kcal: 130, p: 12, f: 7, c: 4 },
  { id: 'ayron', category: 'sut', nameUz: 'Ayron', nameEn: 'Ayran', portionLabel: '1 stakan (~250 ml)', refGrams: 250, kcal: 95, p: 7, f: 5, c: 9 },
  { id: 'kaymoq', category: 'sut', nameUz: 'Kaymoq', nameEn: 'Clotted cream', portionLabel: '1 osh qoshiq (~20 g)', refGrams: 20, kcal: 90, p: 0.8, f: 9, c: 1 },
  { id: 'smetana', category: 'sut', nameUz: 'Smetana', nameEn: 'Sour cream', portionLabel: '1 osh qoshiq (~20 g)', refGrams: 20, kcal: 40, p: 0.6, f: 3.8, c: 0.6 },
  { id: 'protein-kukuni', category: 'sut', nameUz: 'Protein kukuni (whey)', nameEn: 'Whey protein powder', portionLabel: '1 scoop (~30 g)', refGrams: 30, kcal: 120, p: 24, f: 2, c: 3 },

  // ── Non, guruch, kartoshka — Grains & Starches — 11 items ─────────────────
  { id: 'guruch-oq', category: 'non', nameUz: 'Guruch, oq, pishgan', nameEn: 'White rice, cooked', portionLabel: '100 g', refGrams: 100, kcal: 130, p: 2.7, f: 0.3, c: 28 },
  { id: 'guruch-jigarrang', category: 'non', nameUz: 'Guruch, jigarrang', nameEn: 'Brown rice, cooked', portionLabel: '100 g', refGrams: 100, kcal: 112, p: 2.6, f: 0.9, c: 24 },
  { id: 'non-lepyoshka', category: 'non', nameUz: 'Non / lepyoshka', nameEn: 'Uzbek bread', portionLabel: '100 g', refGrams: 100, kcal: 270, p: 9, f: 3, c: 52 },
  { id: 'non-bolak', category: 'non', nameUz: "Non (1 o'rtacha bo'lak)", nameEn: 'Bread, 1 piece', portionLabel: "1 bo'lak (~80 g)", refGrams: 80, kcal: 216, p: 7, f: 2.4, c: 42 },
  { id: 'obi-non', category: 'non', nameUz: 'Obi non', nameEn: 'Plain flatbread', portionLabel: '100 g', refGrams: 100, kcal: 260, p: 8, f: 2, c: 54 },
  { id: 'kartoshka-qaynatilgan', category: 'non', nameUz: 'Kartoshka, qaynatilgan', nameEn: 'Boiled potato', portionLabel: '100 g', refGrams: 100, kcal: 87, p: 2, f: 0.1, c: 20 },
  { id: 'kartoshka-qovurilgan', category: 'non', nameUz: 'Kartoshka, qovurilgan', nameEn: 'Fried potato', portionLabel: '100 g', refGrams: 100, kcal: 312, p: 3.4, f: 15, c: 41 },
  { id: 'makaron', category: 'non', nameUz: 'Makaron / pasta, pishgan', nameEn: 'Pasta, cooked', portionLabel: '100 g', refGrams: 100, kcal: 158, p: 6, f: 0.9, c: 31 },
  { id: 'grechka', category: 'non', nameUz: 'Grechka', nameEn: 'Buckwheat, cooked', portionLabel: '100 g', refGrams: 100, kcal: 92, p: 3.4, f: 0.6, c: 20 },
  { id: 'suli', category: 'non', nameUz: 'Suli / ovsyanka (quruq)', nameEn: 'Oats, dry', portionLabel: '50 g', refGrams: 50, kcal: 190, p: 6.5, f: 3.5, c: 33 },
  { id: 'un', category: 'non', nameUz: 'Un', nameEn: 'Wheat flour', portionLabel: '100 g', refGrams: 100, kcal: 364, p: 10, f: 1, c: 76 },

  // ── Dukkaklilar — Legumes (cooked) — 4 items ──────────────────────────────
  { id: 'noxat', category: 'dukkak', nameUz: "No'xat", nameEn: 'Chickpeas', portionLabel: '100 g', refGrams: 100, kcal: 164, p: 9, f: 2.6, c: 27 },
  { id: 'loviya', category: 'dukkak', nameUz: 'Loviya', nameEn: 'Beans', portionLabel: '100 g', refGrams: 100, kcal: 127, p: 9, f: 0.5, c: 23 },
  { id: 'mosh', category: 'dukkak', nameUz: 'Mosh', nameEn: 'Mung bean', portionLabel: '100 g', refGrams: 100, kcal: 105, p: 7, f: 0.4, c: 19 },
  { id: 'yasmiq', category: 'dukkak', nameUz: 'Yasmiq', nameEn: 'Lentils', portionLabel: '100 g', refGrams: 100, kcal: 116, p: 9, f: 0.4, c: 20 },

  // ── Yong'oq va yog'lar — Nuts & Fats — 9 items ────────────────────────────
  { id: 'yongoq', category: 'yogliklar', nameUz: "Yong'oq", nameEn: 'Walnut (~5 dona)', portionLabel: '15 g', refGrams: 15, kcal: 98, p: 2.3, f: 10, c: 2 },
  { id: 'pista', category: 'yogliklar', nameUz: 'Pista', nameEn: 'Pistachio', portionLabel: '15 g', refGrams: 15, kcal: 85, p: 3, f: 7, c: 4 },
  { id: 'bodom', category: 'yogliklar', nameUz: 'Bodom', nameEn: 'Almond', portionLabel: '15 g', refGrams: 15, kcal: 87, p: 3, f: 7.5, c: 3 },
  { id: 'mayiz', category: 'yogliklar', nameUz: 'Mayiz', nameEn: 'Raisins', portionLabel: '15 g', refGrams: 15, kcal: 45, p: 0.5, f: 0.1, c: 11 },
  { id: 'xurmo', category: 'yogliklar', nameUz: 'Xurmo', nameEn: 'Date', portionLabel: '1 dona (~8 g)', refGrams: 8, kcal: 23, p: 0.2, f: 0, c: 6 },
  { id: 'asal', category: 'yogliklar', nameUz: 'Asal', nameEn: 'Honey', portionLabel: '1 osh qoshiq (~21 g)', refGrams: 21, kcal: 64, p: 0.1, f: 0, c: 17 },
  { id: 'osimlik-yogi', category: 'yogliklar', nameUz: "O'simlik yog'i", nameEn: 'Vegetable oil', portionLabel: '1 osh qoshiq (~14 g)', refGrams: 14, kcal: 120, p: 0, f: 14, c: 0 },
  { id: 'sariyog', category: 'yogliklar', nameUz: "Sariyog'", nameEn: 'Butter', portionLabel: '1 osh qoshiq (~14 g)', refGrams: 14, kcal: 102, p: 0.1, f: 11.5, c: 0 },
  { id: 'kunjut-sedana', category: 'yogliklar', nameUz: "Kunjut yog'i / sedana", nameEn: 'Sesame oil / black seed', portionLabel: '1 choy qoshiq (~5 g)', refGrams: 5, kcal: 40, p: 0.6, f: 4, c: 0.5 },

  // ── Sabzavot va mevalar — Vegetables & Fruit (raw) — 19 items ─────────────
  { id: 'pomidor', category: 'sabzavot', nameUz: 'Pomidor', nameEn: 'Tomato', portionLabel: '100 g', refGrams: 100, kcal: 18, p: 0.9, f: 0.2, c: 3.9 },
  { id: 'bodring', category: 'sabzavot', nameUz: 'Bodring', nameEn: 'Cucumber', portionLabel: '100 g', refGrams: 100, kcal: 15, p: 0.7, f: 0.1, c: 3.6 },
  { id: 'sabzi', category: 'sabzavot', nameUz: 'Sabzi', nameEn: 'Carrot', portionLabel: '100 g', refGrams: 100, kcal: 41, p: 0.9, f: 0.2, c: 10 },
  { id: 'piyoz', category: 'sabzavot', nameUz: 'Piyoz', nameEn: 'Onion', portionLabel: '100 g', refGrams: 100, kcal: 40, p: 1.1, f: 0.1, c: 9 },
  { id: 'karam', category: 'sabzavot', nameUz: 'Karam', nameEn: 'Cabbage', portionLabel: '100 g', refGrams: 100, kcal: 25, p: 1.3, f: 0.1, c: 6 },
  { id: 'ismaloq', category: 'sabzavot', nameUz: 'Ismaloq', nameEn: 'Spinach', portionLabel: '100 g', refGrams: 100, kcal: 23, p: 2.9, f: 0.4, c: 3.6 },
  { id: 'olma', category: 'sabzavot', nameUz: 'Olma', nameEn: 'Apple', portionLabel: "1 dona (~180 g)", refGrams: 180, kcal: 95, p: 0.5, f: 0.3, c: 25 },
  { id: 'banan', category: 'sabzavot', nameUz: 'Banan', nameEn: 'Banana', portionLabel: "1 dona (~120 g)", refGrams: 120, kcal: 105, p: 1.3, f: 0.4, c: 27 },
  { id: 'tarvuz', category: 'sabzavot', nameUz: 'Tarvuz', nameEn: 'Watermelon', portionLabel: '100 g', refGrams: 100, kcal: 30, p: 0.6, f: 0.2, c: 8 },
  { id: 'qovun', category: 'sabzavot', nameUz: 'Qovun', nameEn: 'Melon', portionLabel: '100 g', refGrams: 100, kcal: 34, p: 0.8, f: 0.2, c: 8 },
  { id: 'shaftoli', category: 'sabzavot', nameUz: 'Shaftoli', nameEn: 'Peach', portionLabel: '1 dona (~150 g)', refGrams: 150, kcal: 59, p: 1.4, f: 0.4, c: 14 },
  { id: 'uzum', category: 'sabzavot', nameUz: 'Uzum', nameEn: 'Grapes', portionLabel: '100 g', refGrams: 100, kcal: 69, p: 0.7, f: 0.2, c: 18 },
  { id: 'orik', category: 'sabzavot', nameUz: "O'rik", nameEn: 'Apricot', portionLabel: '1 dona (~35 g)', refGrams: 35, kcal: 17, p: 0.5, f: 0.1, c: 4 },
  { id: 'anor', category: 'sabzavot', nameUz: 'Anor', nameEn: 'Pomegranate (arils)', portionLabel: '150 g', refGrams: 150, kcal: 125, p: 2.5, f: 1.8, c: 29 },
  { id: 'anjir', category: 'sabzavot', nameUz: 'Anjir', nameEn: 'Fig', portionLabel: '1 dona (~50 g)', refGrams: 50, kcal: 37, p: 0.4, f: 0.2, c: 10 },
  { id: 'tut', category: 'sabzavot', nameUz: 'Tut', nameEn: 'Mulberry', portionLabel: '100 g', refGrams: 100, kcal: 43, p: 1.4, f: 0.4, c: 10 },
  { id: 'kayisi', category: 'sabzavot', nameUz: 'Kayisi (quritilgan)', nameEn: 'Dried apricot', portionLabel: '30 g', refGrams: 30, kcal: 72, p: 1, f: 0.1, c: 18 },
  { id: 'quruq-meva', category: 'sabzavot', nameUz: 'Mayiz / quruq meva aralash', nameEn: 'Dried fruit mix', portionLabel: '30 g', refGrams: 30, kcal: 90, p: 1, f: 0.2, c: 22 },
  { id: 'limon', category: 'sabzavot', nameUz: 'Limon (sharbati)', nameEn: 'Lemon, juice', portionLabel: '1 dona (~50 g)', refGrams: 50, kcal: 12, p: 0.4, f: 0.1, c: 4 },

  // ── An'anaviy taomlar — Traditional Cooked Dishes — 23 items ──────────────
  { id: 'osh-palov', category: 'taomlar', nameUz: 'Osh / palov', nameEn: 'Plov, typical', portionLabel: '1 kosa (~350 g)', refGrams: 350, kcal: 640, p: 22, f: 28, c: 78 },
  { id: 'shashlik-mol', category: 'taomlar', nameUz: "Shashlik, mol/qo'y", nameEn: 'Beef/lamb skewer', portionLabel: '1 shix (~80 g)', refGrams: 80, kcal: 190, p: 16, f: 14, c: 1 },
  { id: 'shashlik-tovuq', category: 'taomlar', nameUz: 'Shashlik, tovuq', nameEn: 'Chicken skewer', portionLabel: '1 shix (~80 g)', refGrams: 80, kcal: 150, p: 17, f: 8, c: 1 },
  { id: 'shorva', category: 'taomlar', nameUz: "Sho'rva", nameEn: 'Meat & veg soup', portionLabel: '1 kosa (~400 g)', refGrams: 400, kcal: 350, p: 22, f: 18, c: 26 },
  { id: 'mastava', category: 'taomlar', nameUz: 'Mastava', nameEn: 'Rice soup', portionLabel: '1 kosa (~400 g)', refGrams: 400, kcal: 300, p: 14, f: 12, c: 36 },
  { id: 'dimlama', category: 'taomlar', nameUz: 'Dimlama', nameEn: 'Steamed meat + veg', portionLabel: '1 tovoq (~400 g)', refGrams: 400, kcal: 420, p: 26, f: 24, c: 28 },
  { id: 'qovurma', category: 'taomlar', nameUz: "Qovurma / dimlama go'sht", nameEn: 'Braised meat', portionLabel: '1 porsiya (~250 g)', refGrams: 250, kcal: 480, p: 30, f: 34, c: 12 },
  { id: 'manti-1', category: 'taomlar', nameUz: 'Manti', nameEn: 'Manti, 1 piece', portionLabel: '1 dona (~90 g)', refGrams: 90, kcal: 170, p: 7, f: 8, c: 17 },
  { id: 'manti-4', category: 'taomlar', nameUz: 'Manti (4 dona)', nameEn: 'Manti, 4 pieces', portionLabel: '4 dona (~360 g)', refGrams: 360, kcal: 680, p: 28, f: 32, c: 68 },
  { id: 'chuchvara', category: 'taomlar', nameUz: 'Chuchvara', nameEn: 'Dumpling soup', portionLabel: '1 kosa (~350 g)', refGrams: 350, kcal: 330, p: 16, f: 13, c: 38 },
  { id: 'lagmon', category: 'taomlar', nameUz: "Lag'mon", nameEn: 'Noodles + meat', portionLabel: '1 kosa (~400 g)', refGrams: 400, kcal: 470, p: 22, f: 18, c: 55 },
  { id: 'norin', category: 'taomlar', nameUz: 'Norin', nameEn: 'Norin', portionLabel: '1 porsiya (~300 g)', refGrams: 300, kcal: 450, p: 26, f: 20, c: 44 },
  { id: 'somsa-goshtli', category: 'taomlar', nameUz: "Somsa, go'shtli", nameEn: 'Meat somsa', portionLabel: '1 dona (~120 g)', refGrams: 120, kcal: 320, p: 12, f: 17, c: 30 },
  { id: 'qatlama', category: 'taomlar', nameUz: 'Qatlama / qotirma', nameEn: 'Layered fried bread', portionLabel: "1 bo'lak (~100 g)", refGrams: 100, kcal: 380, p: 7, f: 20, c: 44 },
  { id: 'patir', category: 'taomlar', nameUz: "Non-patir, yog'li", nameEn: 'Rich patir bread', portionLabel: '~100 g', refGrams: 100, kcal: 360, p: 8, f: 14, c: 50 },
  { id: 'beshbarmoq', category: 'taomlar', nameUz: 'Beshbarmoq', nameEn: 'Beshbarmak', portionLabel: '1 porsiya (~350 g)', refGrams: 350, kcal: 520, p: 32, f: 26, c: 42 },
  { id: 'jarkop', category: 'taomlar', nameUz: 'Jarkop', nameEn: 'Meat & potato stew', portionLabel: '1 porsiya (~350 g)', refGrams: 350, kcal: 480, p: 28, f: 28, c: 30 },
  { id: 'moshkichiri', category: 'taomlar', nameUz: 'Moshkichiri', nameEn: 'Mung bean + rice', portionLabel: '1 kosa (~350 g)', refGrams: 350, kcal: 380, p: 16, f: 12, c: 52 },
  { id: 'dolma', category: 'taomlar', nameUz: 'Dolma', nameEn: 'Stuffed leaves/veg', portionLabel: '1 porsiya (~250 g)', refGrams: 250, kcal: 340, p: 16, f: 20, c: 24 },
  { id: 'xonim', category: 'taomlar', nameUz: 'Xonim', nameEn: 'Steamed roll', portionLabel: '1 porsiya (~250 g)', refGrams: 250, kcal: 420, p: 12, f: 18, c: 52 },
  { id: 'kabob-qiyma', category: 'taomlar', nameUz: 'Kabob, qiyma', nameEn: 'Minced kebab', portionLabel: '1 dona (~70 g)', refGrams: 70, kcal: 180, p: 12, f: 13, c: 3 },
  { id: 'tandir-gosht', category: 'taomlar', nameUz: "Tandir go'sht", nameEn: 'Tandoor roast meat', portionLabel: '~150 g', refGrams: 150, kcal: 390, p: 34, f: 28, c: 0 },
  { id: 'kuk-somsa', category: 'taomlar', nameUz: 'Kuk somsa', nameEn: 'Greens somsa', portionLabel: '1 dona (~110 g)', refGrams: 110, kcal: 250, p: 6, f: 12, c: 29 },

  // ── Shirinliklar — Snacks & Sweets — 7 items ──────────────────────────────
  { id: 'shokolad-sutli', category: 'shirinlik', nameUz: 'Shokolad, sutli', nameEn: 'Milk chocolate', portionLabel: '100 g', refGrams: 100, kcal: 535, p: 7, f: 30, c: 59 },
  { id: 'shokolad-bolak', category: 'shirinlik', nameUz: "Shokolad (1 bo'lak)", nameEn: 'Chocolate, 1 piece', portionLabel: '~25 g', refGrams: 25, kcal: 134, p: 1.8, f: 7.5, c: 15 },
  { id: 'qora-shokolad', category: 'shirinlik', nameUz: 'Qora shokolad 70%', nameEn: 'Dark chocolate 70%', portionLabel: '100 g', refGrams: 100, kcal: 550, p: 8, f: 43, c: 46 },
  { id: 'halva', category: 'shirinlik', nameUz: 'Halva', nameEn: 'Halva', portionLabel: '100 g', refGrams: 100, kcal: 520, p: 12, f: 30, c: 50 },
  { id: 'pechenye', category: 'shirinlik', nameUz: 'Pechenye', nameEn: 'Biscuits', portionLabel: '100 g', refGrams: 100, kcal: 480, p: 7, f: 20, c: 68 },
  { id: 'muzqaymoq', category: 'shirinlik', nameUz: 'Muzqaymoq', nameEn: 'Ice cream', portionLabel: '100 g', refGrams: 100, kcal: 207, p: 3.5, f: 11, c: 24 },
  { id: 'shakar', category: 'shirinlik', nameUz: 'Shakar', nameEn: 'Sugar', portionLabel: '1 choy qoshiq (~4 g)', refGrams: 4, kcal: 16, p: 0, f: 0, c: 4 },

  // ── Ichimliklar — Drinks — 16 items ───────────────────────────────────────
  { id: 'suv', category: 'ichimlik', nameUz: 'Suv', nameEn: 'Water', portionLabel: '250 ml', refGrams: 250, kcal: 0, p: 0, f: 0, c: 0 },
  { id: 'choy', category: 'ichimlik', nameUz: 'Choy, shakarsiz', nameEn: 'Tea, no sugar', portionLabel: '250 ml', refGrams: 250, kcal: 2, p: 0, f: 0, c: 0.5 },
  { id: 'choy-shakar', category: 'ichimlik', nameUz: 'Choy + 2 choy qoshiq shakar', nameEn: 'Sweet tea', portionLabel: '250 ml', refGrams: 250, kcal: 34, p: 0, f: 0, c: 8.5 },
  { id: 'sut-yogli-ich', category: 'ichimlik', nameUz: "Sut, yog'li 3.2%", nameEn: 'Whole milk', portionLabel: '250 ml', refGrams: 250, kcal: 150, p: 8, f: 8, c: 12 },
  { id: 'sut-kam-ich', category: 'ichimlik', nameUz: "Sut, kam yog'li 1%", nameEn: 'Low-fat milk', portionLabel: '250 ml', refGrams: 250, kcal: 105, p: 8, f: 2.5, c: 12 },
  { id: 'ayron-ich', category: 'ichimlik', nameUz: 'Ayron', nameEn: 'Ayran', portionLabel: '250 ml', refGrams: 250, kcal: 95, p: 7, f: 5, c: 9 },
  { id: 'kompot', category: 'ichimlik', nameUz: "Kompot (uy, o'rtacha shirin)", nameEn: 'Homemade compote', portionLabel: '250 ml', refGrams: 250, kcal: 100, p: 0.4, f: 0.2, c: 25 },
  { id: 'kola', category: 'ichimlik', nameUz: 'Kola / gazli ichimlik', nameEn: 'Cola', portionLabel: '330 ml', refGrams: 330, kcal: 139, p: 0, f: 0, c: 35 },
  { id: 'kola-diet', category: 'ichimlik', nameUz: 'Kola, dietik', nameEn: 'Diet / zero cola', portionLabel: '330 ml', refGrams: 330, kcal: 1, p: 0, f: 0, c: 0 },
  { id: 'fanta', category: 'ichimlik', nameUz: 'Fanta / gazli shirin', nameEn: 'Sweet soda', portionLabel: '330 ml', refGrams: 330, kcal: 160, p: 0, f: 0, c: 42 },
  { id: 'meva-sharbati', category: 'ichimlik', nameUz: 'Meva sharbati', nameEn: 'Fruit juice', portionLabel: '250 ml', refGrams: 250, kcal: 115, p: 0.5, f: 0.2, c: 28 },
  { id: 'mojito', category: 'ichimlik', nameUz: 'Mojito (klassik, shakarli)', nameEn: 'Mojito, classic sweet', portionLabel: '250 ml', refGrams: 250, kcal: 180, p: 0, f: 0, c: 24 },
  { id: 'energetik', category: 'ichimlik', nameUz: 'Energetik ichimlik', nameEn: 'Energy drink', portionLabel: '250 ml', refGrams: 250, kcal: 112, p: 0, f: 0, c: 28 },
  { id: 'qahva', category: 'ichimlik', nameUz: 'Qahva, qora', nameEn: 'Black coffee', portionLabel: '1 chashka (~250 ml)', refGrams: 250, kcal: 2, p: 0.3, f: 0, c: 0 },
  { id: 'kapuchino', category: 'ichimlik', nameUz: 'Kapuchino (sutli, shakarsiz)', nameEn: 'Cappuccino, no sugar', portionLabel: '250 ml', refGrams: 250, kcal: 90, p: 5, f: 5, c: 7 },
  { id: 'protein-shake', category: 'ichimlik', nameUz: 'Protein shake (sut + kukun)', nameEn: 'Protein shake', portionLabel: '300 ml', refGrams: 300, kcal: 240, p: 32, f: 8, c: 10 },
];

export const FOOD_BY_ID: Record<string, FoodItem> = Object.fromEntries(
  FOODS.map((f) => [f.id, f]),
);

export function foodsByCategory(cat: CategoryId): FoodItem[] {
  return FOODS.filter((f) => f.category === cat);
}

/** Scale a food's macros to an arbitrary gram amount. */
export function scaleFood(food: Pick<FoodItem, 'refGrams' | 'kcal' | 'p' | 'f' | 'c'>, grams: number) {
  const k = grams / food.refGrams;
  return { kcal: food.kcal * k, p: food.p * k, f: food.f * k, c: food.c * k };
}
