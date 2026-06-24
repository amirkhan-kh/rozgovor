const MALE_NAMES = [
  "Azizbek", "Sardor", "Jasur", "Bobur", "Ulug'bek", "Doniyor", "Otabek",
  "Javohir", "Shaxzod", "Islom", "Akmal", "Behruz", "Diyor", "Farrux",
  "Shohrux", "Asadbek", "Alisher", "Zafar", "Rustam", "Anvar", "Kamron",
  "Muhammadali", "Abdulaziz", "Ibrohim", "Umarbek", "Quvondiq", "Sanjar",
  "Bekzod", "Xurshid", "Qahramon", "Temur", "Murodjon", "Nurbek",
];

const FEMALE_NAMES = [
  "Madina", "Nilufar", "Zilola", "Dilnoza", "Gulnoza", "Malika", "Shahnoza",
  "Marjona", "Nargiza", "Dilrabo", "Zarina", "Sevara", "Kamola", "Feruza",
  "Moxinur", "Shaxzoda", "Laylo", "Munisa", "Diyora", "Komila", "Gulshoda",
  "Aziza", "Robiya", "Nodira", "Yulduz", "Rayhona", "Zebo", "Mohira",
  "Shohsanam", "Asila", "Iroda", "Xadicha", "Hilola",
];

const CHILD_MALE_NAMES = [
  "Muhammadaziz", "Alijon", "Umarjon", "Dovudbek", "Mansurjon", "Islomjon",
  "Ibrohim", "Yusufbek", "Abbos", "Asadbek", "Diyorjon",
];

const CHILD_FEMALE_NAMES = [
  "Zaynab", "Xadichabonu", "Muslimaxon", "Fotimaxon", "Asalbonu", "Sabinaxon",
  "Omina", "Robiya", "Hafsaxon", "Madinabonu",
];

export function randomUzbekName(gender: "male" | "female", age: number): string {
  const isChild = age <= 16;
  const pool = gender === "male"
    ? (isChild ? [...CHILD_MALE_NAMES, ...MALE_NAMES.slice(0, 10)] : MALE_NAMES)
    : (isChild ? [...CHILD_FEMALE_NAMES, ...FEMALE_NAMES.slice(0, 10)] : FEMALE_NAMES);
  return pool[Math.floor(Math.random() * pool.length)];
}
