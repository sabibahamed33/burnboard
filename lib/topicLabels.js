/**
 * BURNBOARD — Topic display labels (multilingual, canonical slugs).
 *
 * Canonical identity is always the English slug stored in `topics.slug`.
 * These labels are DISPLAY ONLY — no duplicate topics are created per
 * language, and user content referencing topics is never rewritten.
 */

const LABELS = {
  gaming: { en: 'Gaming', bn: 'গেমিং', hi: 'गेमिंग', es: 'Juegos', fr: 'Jeux vidéo', ar: 'ألعاب' },
  music: { en: 'Music', bn: 'সংগীত', hi: 'संगीत', es: 'Música', fr: 'Musique', ar: 'موسيقى' },
  movies: { en: 'Movies', bn: 'সিনেমা', hi: 'फिल्में', es: 'Cine', fr: 'Cinéma', ar: 'أفلام' },
  sports: { en: 'Sports', bn: 'খেলাধুলা', hi: 'खेल', es: 'Deportes', fr: 'Sport', ar: 'رياضة' },
  tech: { en: 'Tech', bn: 'প্রযুক্তি', hi: 'तकनीक', es: 'Tecnología', fr: 'Tech', ar: 'تقنية' },
  food: { en: 'Food', bn: 'খাবার', hi: 'खाना', es: 'Comida', fr: 'Cuisine', ar: 'طعام' },
  travel: { en: 'Travel', bn: 'ভ্রমণ', hi: 'यात्रा', es: 'Viajes', fr: 'Voyage', ar: 'سفر' },
  fashion: { en: 'Fashion', bn: 'ফ্যাশন', hi: 'फैशन', es: 'Moda', fr: 'Mode', ar: 'موضة' },
  fitness: { en: 'Fitness', bn: 'ফিটনেস', hi: 'फिटनेस', es: 'Fitness', fr: 'Fitness', ar: 'لياقة' },
  comedy: { en: 'Comedy', bn: 'কমেডি', hi: 'कॉमेडी', es: 'Comedia', fr: 'Humour', ar: 'كوميديا' },
  art: { en: 'Art', bn: 'শিল্প', hi: 'कला', es: 'Arte', fr: 'Art', ar: 'فن' },
  books: { en: 'Books', bn: 'বই', hi: 'किताबें', es: 'Libros', fr: 'Livres', ar: 'كتب' },
  dating: { en: 'Dating', bn: 'ডেটিং', hi: 'डेटिंग', es: 'Citas', fr: 'Rencontres', ar: 'مواعدة' },
  career: { en: 'Career', bn: 'ক্যারিয়ার', hi: 'करियर', es: 'Carrera', fr: 'Carrière', ar: 'مهنة' },
  startups: { en: 'Startups', bn: 'স্টার্টআপ', hi: 'स्टार्टअप', es: 'Startups', fr: 'Startups', ar: 'شركات ناشئة' },
  crypto: { en: 'Crypto', bn: 'ক্রিপ্টো', hi: 'क्रिप्टो', es: 'Cripto', fr: 'Crypto', ar: 'عملات رقمية' },
  photography: { en: 'Photography', bn: 'ফটোগ্রাফি', hi: 'फोटोग्राफी', es: 'Fotografía', fr: 'Photo', ar: 'تصوير' },
  'pop-culture': { en: 'Pop Culture', bn: 'পপ সংস্কৃতি', hi: 'पॉप कल्चर', es: 'Cultura pop', fr: 'Pop culture', ar: 'ثقافة شعبية' },
  wellness: { en: 'Wellness', bn: 'সুস্থতা', hi: 'वेलनेस', es: 'Bienestar', fr: 'Bien-être', ar: 'عافية' },
  debates: { en: 'Debates', bn: 'বিতর্ক', hi: 'बहस', es: 'Debates', fr: 'Débats', ar: 'مناظرات' },
};

function baseLang(lang) {
  return String(lang || 'en').toLowerCase().split(/[-_]/)[0];
}

/** Display label for a topic (by slug or {slug,name}); falls back to stored name. */
export function topicLabel(topic, lang) {
  const slug = typeof topic === 'string' ? topic : topic?.slug;
  const entry = slug ? LABELS[slug.toLowerCase()] : null;
  if (entry) return entry[baseLang(lang)] || entry.en;
  return (typeof topic === 'object' ? topic?.name : topic) || '';
}

/** All known topic labels for a language (for pickers/grids). */
export function allTopicLabels(lang) {
  const b = baseLang(lang);
  return Object.entries(LABELS).map(([slug, entry]) => ({ slug, label: entry[b] || entry.en }));
}
