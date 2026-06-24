// ProSales ning qo'lda yozilgan 3 etalon senariysi (Google Docs'dan).
// AI'ga misol sifatida yuboriladi — "oltin senariy" qanday batafsil bo'lishi kerakligi.
// MUHIM: har bosqichda menejer gapi + mijoz javob variantlariga qarab alternativ javoblar.

export const PROSALES_PRESALE_EXAMPLE = `
# PRE SALE (1-qo'ng'iroq) — ETALON SENARIY

## 1. Tanishuv
**Menejer:** "Assalomu alaykum, Shodiyor aka yaxshimisiz? Sarvar Zaynutdinov menejerlari bo'laman ismim Madina. Xizmatimizga qiziqish bildirgan ekansiz, shu haqida ma'lumot bermoqchi edim. 2 daqiqa vaqtingiz bora?"

| Mijoz: "Ha" | Mijoz: "Yo'q" | Mijoz: "Men qoldirmaganman" |
|---|---|---|
| Suhbatni davom ettiramiz | Keyingi qo'ng'iroq vaqtini aniqlashtirib, suhbatni yakunlaymiz | "Hayronman, telefon raqamingiz tushgan ekan. Sotuv bo'lim yoki call centre qurish masalasi bo'yicha qoldirmaganmisiz?" |

## 2. Small talk
**Menejer:** "Shodiyor aka qayerdansiz?"

## 3. Programmalashtirish
**Menejer:** "Shodiyor aka sizga qaysi xizmatimiz to'g'ri kelishini bilish uchun sizga 4-5 savollar berib o'taman, undan keyin savollaringizga javob berib ketaman. Kelishdikmi?"

## 4. Kvalifikatsiya savollari
**Menejer:** "Siz o'zingiz biznes egasimisiz?"

| Mijoz: "Ha" | Mijoz: "Yo'q" |
|---|---|
| "Aha tushunarli, Shodiyor aka o'zi qaysi sohada faoliyat yuritasiz?" | "Aha, qanday lavozimda ishlaysiz?" (agar ROP bo'lsa: "Siz bilan gaplashib turganimdan xursandman. Siz bu tizimning ichida har kuni ishlayapsiz. Biz o'zimizning tizimni biznesga to'liq qo'llay olishimiz uchun, qaror qabul qiluvchi biznes egasi bilan ham bevosita gaplashishimiz zarur bo'ladi. Sababi bu tizimda nafaqat sotuv modeli, balki KPI, byudjet, xodim siyosati ham bor.") |

**Menejer (soha aniqlangach):** "Zo'r, Shodiyor aka oylik aylanmangizni ayta olasizmi? +- qancha orasida?"

**Agar HoReCa/retail/chakana/optom/distributsiya bo'lsa:** "Shodiyor aka sizni tushundim. Biz qurayotgan sotuv tizimi — o'z mahsulotini telefon, yozishma yoki shaxsiy savdo orqali faol ravishda sotadigan kompaniyalar uchun ishlaydi. Sizga xizmat ko'rsata olmaymiz. Ishlaringizga rivoj tilaymiz, salomat bo'ling!"

**Menejer (aylanma aytilgach, $35K+):** "Aha, marketing yani targetga ham pul sarflaysizmi? Qancha atrofida sarflaysiz?"

**Menejer ($2K+ marketing):** "Shodiyor aka Xudo xohlasa TISRO'YN produktimiz sotuvizni oshirishga yordam bera oladi. Shodiyor aka hozir sotuv bo'limingizda nima muammolar kuzatilmoqda?"

**Muammo eshitilgach:** "Shodiyor aka men sizga holatingiz bo'yicha savollarim qolmadi. Kelin unda produktimiz bo'yicha qisqacha aytib beraman va sizga qanday yordam berishimiz haqida ham ma'lumot berib o'taman."

## 5. Mini Taqdimot (TISRO'YN)
**Menejer:** "Sarvar Zaynutdinov o'zlari 8 yillik sotuv bo'lim qurish va tizimlashtirish bo'yicha mutaxassislar. Hyundai, Skoda, Volkswagen, KFC, Dafna kabi korxonalarda ishlaganlar. 40 ga yaqin sotuv bo'limini qurib, sotuvlarini 26% dan 401% gacha oshirishga erishganmiz.

TISRO'YN — bu:
- **T**: Konkurentlar va mijozlarni o'rganish, CJM, varonka, strategiya
- **I**: CRM integratsiya, IP telefoniya, SMS rasilkalar
- **S**: 7 ga yaqin sotuv senariy skriptlari (hozirgi suhbatim ham senariy bo'yicha ketmoqda)
- **R**: Moddiy va nomoddiy motivatsiyalar
- **O'**: 3 kun ichida yangi xodimni sotuvga tushirish tizimi
- **Y**: Xodimlarni yollash tizimi
- **N**: Sotuv bo'limini sizsiz ishlash tizimi va nazorat"

## 6. Uchrashuv belgilash
**Menejer:** "Shodiyor aka, holatingizdan kelib chiqqan holda, sotuv bo'limingizni to'liq o'rganish uchun Sarvar aka Zaynutdinov bilan uchrashuvga taklif qilaman. Uchrashuvni shaxsan Sarvar Zaynutdinov bilan individual belgilab beraman. Ular sizning biznes holatingizni ko'rib chiqib:
– Qaysi sotuv modeli sizga mos
– Qanday varonka va skript ishlaydi
– Biznesingizda o'sish nuqtalari
– Xizmatimiz bo'yicha savollarga javob

Bonus: sotuv bo'limimizni ekskurisya qilib ko'rsatamiz.
Ertaga soat 14:00 ga bizning ofisda uchrashuv belgilasam sizga qulay bo'ladimi?"

| Mijoz: "Ha bo'ladi" | Mijoz: "Yo'q, bandman" | Mijoz: "Narxi qancha?" |
|---|---|---|
| "Unda kelishdik, ertaga 14:00 da ofisimizda kutib qolamiz. Telegramingizdan lokatsiya yuboraman. Kuningiz hayrli o'tsin!" | "Unda indinga 18:00 da vaqtlari bor ekan, shu vaqtga uchrashuv belgilasam qulay bo'ladimi?" | "1) Boya aytganimdek Sarvar aka bilan narx va vaqt masalasi bo'yicha gaplashib olsangiz bo'ladi. 2) Narx va vaqt masalasi biznesingizga qarab individual beriladi, Xudo xohlasa uchrashuvda javob olsangiz bo'ladi." |

## 7. Dojim (yakuniy eslatma)
**Menejer:** "Shodiyor aka eng muhim qismi qoldi — faqat uchrashuvni o'tkazib yubormang, sababi Sarvar aka hozir 10 ga yaqin loyihada ishlayaptilar. Agar uchrashuv vaqti o'zgarsa keyingi uchrashuv vaqtini belgilash juda qiyin bo'lishi mumkin. Uchrashuvdan bir soat oldin sizga yana xabar beraman. Ismim Madina, kuningiz xayrli va maroqli o'tsin!"
`;

export const PROSALES_SALES_EXAMPLE = `
# SALES (uchrashuvdagi sotuv) — ETALON SENARIY

## 1. Tanishuv
**Menejer:** "Assalomu alaykum, Shodiyor aka yaxshimisiz? Pro Sales agentligi rahbari va sotuv bo'limi qurish bo'yicha mutaxassis ismim Sarvar Zaynutdinov." *(Vizitka taqdim qilish)*

## 2. Small talk
**Menejer:** "Shodiyor aka mahalla ichida topish qiyin bo'lmadimi ofisimizni? Nima ichasiz? (Choy/kofe/yaxna ichimlik)"

## 3. Vaqtni eslatish
**Menejer:** "Uchrashuvga o'rtacha 2 soat vaqt ketadi, sizda bemalolmi?"

## 4. Uchrashuv rejasini taklif qilish
**Menejer:** "Hozir sizga birinchi sotuv bo'limimni ko'rsatsam — o'zi sotuv bo'limi qanaqa bo'lish kerak va o'zimiz haqimizda aytib bersam, keyin sizning masalalaringizni ko'rib chiqsak, nima deysiz?"

| Mijoz: "Rozi" | Mijoz: "Yo'q ko'rganman" |
|---|---|
| "Aha tushunarli, qani kettik bo'lmasa!" | "Aha tushunarli, unda boshlaymiza." |

## 5. Icebreaker
**Menejer:** "Sotuv bo'limi qiynayaptimi aka?" *(Mijoz dardni to'liq eshitamiz, raqamlar muammosi haqida yozib olamiz)*

## 6. Ehtiyojni aniqlash (SOPRANO)
- **S — Soha:** "Sohangiz qanaqa, nima sotasiz? Tajribangiz qancha? Sotuv bo'limi bormi? Nechta odam ishlaydi? Konversiya nechi? Marketing byudjet qancha? Nechta lid tushadi? Lid sifati? Lid narxi? O'rtacha chek? Raqobatchilar kim? CRM bormi? Hodimlar oylik va bonus qanaqa?"
- **O — Oldingi tajriba:** "Oldin sotuv bo'limi qurib ko'rganmisiz?"
- **P — Muammo:** "Muammo nimada, hozir nima sizni uxlatmayapti?"
- **R — Rais:** "Biznesda bir o'zingizmisiz yoki sheriklar bormi? Katta harjatlarni odatda kim bilan maslahat qilasiz?"
- **A — Alternativlar:** "Hozir boshqa sotuv bo'limi quradiganlar bilan peregavor qilayapsizmi?"
- **N — Nega qabul qilmaydi:** "Qanaqa konsaltinglar bilan umuman ishlamagan bo'lardiz?"
- **O — Qachon:** "Qachon sotuv bo'limingiz soatdek ishlayotgan bo'lishi kerak?"

## 7. Taqdimotdan oldingi tasdiqlash
**Menejer:** "Shodiyor aka sizning holatingizni to'liq tushungan bo'lsam — sizda hozir [muammolar ro'yxati] holat, to'g'rimi?"

## 8. Taqdimot (XAF: Xususiyat + Afzallik + Foyda)
**Menejer:** "Keling bo'lmasa biz sizga qanday yordam bera olamiz tushuntirib beraman. Produktimiz nomi TISRO'YN — bu nemischa nom emas, o'zbekcha so'zlarning qisqartmasi. *(Doskaga chizib tushuntirib beramiz — afzallik beradi)*"

**Xususiyat:** 40+ sotuv bo'limi qurib, 26% dan 401% gacha oshirganmiz. TISRO'YN (T-I-S-R-O'-Y-N bo'yicha batafsil).

**Afzallik:** "Omadim kelgani o'zim xalqaro korxonalarda ishlaganimda Hyundai, Skoda, Volkswagen, KFC da bu tizimni o'rganganman. Hamma narsa tayyor qilib yozib qo'yilgan, hech narsani ixtiro qilish shart emas. Yana muhim joyi — ko'pchilik sotuv bo'limi quraman deydi-yu, o'zida sotuv bo'limi yo'q. Men oldin o'zimga qildim, keyin birovga qilib beramiz. Pichoqni oldin o'zinga ur deydiku."

**Foyda:** "Sotuv bo'limi qurilganda nima bo'ladi? Siz tepasida turmasangiz ham ishlash kerak. Hamma narsa tayyor bo'lsa hamma o'z ishini o'zi qiladi. Biz sizga mashinani yasab haydab ko'rsatib beramiz, qolgan hammasi sizi nazoratizda bo'ladi. Bitta dashboard orqali muammo qayerda ekanini va kim bilan qanday ohangda gaplashishni bilasiz. Siz emas — tizim ko'proq ishlaydi. Hodim almashishi mumkin, lekin tizim ishlashda davom etadi."

## 9. Narx aytish
**Menejer:** "Birinchi qimmat tarif ko'rsatiladi, keyin arzonlari va arzon tarifning afzalliklari sanaladi. Qimmat tarif mijozga hozircha shart emasligi ko'rsatiladi."

## 10. E'tirozlar bilan ishlash
- Hamma e'tirozlarni yig'ish, mijozni yaxshilab eshitish
- U uchun muhim bo'lgan e'tirozni eshitish va muammo bo'lmagan vaziyatni yaratib e'tiroz haqiqiy yoki soxta ekanligini ko'rsatish
- Mijoz tarafiga o'tib, uning tarafda tushunilganini aytish
- Sotuv bo'limi qurishdagi xatoliklar haqida aytish
- Raqamlarda: hozircha qancha pul havoga ketayotgani va agar shunday davom etsa qancha pul yo'qotish mumkinligi

## 11. ODC (Offer + Deadline + Call to action)
**Menejer:** "Agar bugun 'davay' desangiz, men sizga % chegirma qilib beraman. Taklif faqat 1 kun ishlidi, 1 kundan keyin bu taklifni boshqa korxonalarga beramiz. Bu taklif faqat bir korxonaga beriladi — sizdan keyin kelgan mijoz bugun bu taklifni ololmaydi, lekin ertaga olishi mumkin. Nima deysiz?"

| Mijoz: "Roziman, ishni boshlaylik" | Mijoz: "O'ylab ko'rishim kerak" | Mijoz: "Narxini kelishtirib bering" |
|---|---|---|
| "Kelishdik, shartnoma qilib olsak 3 ish kunida ishni boshlaymiz. Korxona rekvizitlarini tashlab berasizmi?" | "Sizning o'rningizda bo'lsam men ham o'ylagan bo'lardim. Yostiq bilan maslahat qilib o'ylab ko'ring, lekin muhim qismi bor: sotuv bo'limini tizimlashtiras aniq — yo hozir, yo hamma konkurentlar qilishni boshlaganda. Konkurentlardan o'tib ketish uchun hozir eng zo'r payt." | "Xohlasangiz 90% chegirma beraman, nima desangiz? Faqat sharti bor: nechi foiz chegirma bersam, shuncha foiz chegirma beradigan tizim qilib beraman sizga ham. Sababi o'zim 100% sotolmasam, qanday qilib sizga shunday tizim qila olaman?" |

## 12. Kelishuv (agar mijoz ikkilansa)
**Menejer:** "Keling bo'lmasa sotuv bo'limingizni audit qilamiz. Buning narxi $200, lekin sizga bepulga qilib beramiz va cheklist orqali xatoliklarni ko'rsatamiz. Keyin eng katta raqobatchingiz qanday ishlayotganini ham tekshirib solishtirib ko'ramiz. Menga 3 kun vaqt bersangiz, to'liq auditdan keyin yana bitta uchrashuv qilamiz, nima deysiz?"

## 13. Small talk (yakuniy)
Suhbat tugagach small talk davom etadi yoki ofis haqida gaplashiladi — mijoz ofisi qayerda ekanligi va h.k.

## 14. Xayrlashuv
**Menejer:** Mijozga firmenniy sovg'a beriladi, maroqli suhbat uchun minnatdorchilik bildirib, eshik oldigacha kuzatib, ketguncha qarab turamiz.
`;

export const PROSALES_AFTERSALE_EXAMPLE = `
# AFTER SALE (G'amxo'rlik bo'limi) — ETALON SENARIY

## 1. Tanishuv
**Menejer:** "Assalomu alaykum Dilmurod aka yaxshimisiz? Pro Sales korxonasidan (Sarvar Zaynutdinov) sifat nazorati menejeriman, ismim Mufazzala. 2 daqiqa vaqtingizni olaman maylimi?"

| Mijoz: "Ha" | Mijoz: "Yo'q" |
|---|---|
| Suhbatni davom ettiramiz | Keyingi qo'ng'iroq vaqtini aniqlashtirib, suhbatni yakunlaymiz |

## 2. Maqsadni aytish
**Menejer:** "Men sizga sifat nazorati bo'limidan qo'ng'iroq qilayotgan edim — muammo yoki kamchiliklarni bilish uchun. Agar kamchilik yoki muammolarni aytsangiz, uni to'g'irlashga harakat qilamiz."

## 3. Muammolar so'rash
| Mijoz: Muammo aytadi | Mijoz: "Hammasi yaxshi" |
|---|---|
| To'liq eshitamiz, bo'lmasdan. "Bu holat uchun sizdan uzr so'rayman. Hamma muammolarni yozib oldim, sizga tez orada hal qilib qayta aloqaga chiqaman va holat bo'yicha hisobot topshiraman." *(Barcha muammolar korxona rahbariga yetkaziladi)* | "Bizga xizmatimiz sifatini oshirish uchun taklif yoki tavsiyalar bera olasizmi? Sizning fikringiz biz uchun juda muhim." |

## 4. Taklif eshitilgach
**Menejer:** "Taklif va tavsiyalaringiz uchun juda minnatdorman. Siz kabi mijozlar bizni yanada o'sishimizga yordam berasiz. Bizning rivojimizga befarq bo'lmaganingiz uchun alohida rahmat!"

## 5. Xayrlashuv
**Menejer:** "Kuningiz yaxshi o'tsin. Agarda qandaydir muammolar ish jarayonida yuzaga kelsa, ushbu raqamga aloqaga chiqishingiz mumkin. Eslatib o'taman, ismim Mufazzala. Kuningiz xayrli va barakali o'tsin!"
`;

export const PROSALES_ALL_EXAMPLES = `
${PROSALES_PRESALE_EXAMPLE}

${PROSALES_SALES_EXAMPLE}

${PROSALES_AFTERSALE_EXAMPLE}
`;

// Eski eksport — hozir ham qayta chaqirilsa ishlash davom etadi
export const PROSALES_EXAMPLE_SCENARIO = PROSALES_ALL_EXAMPLES;
