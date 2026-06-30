// Bitrix24 portal manzili — YAGONA manba.
// Ilgari har bir fayl o'z default URL'ini hardcode qilardi (`psg.bitrix24.uz/rest/21`),
// aktiv portal esa `rozgovoruz.bitrix24.kz/rest/527`. Env belgilanmasa sync NOTO'G'RI
// portalga ketib, "ma'lumotlar Bitrix bilan mos kelmaydi" bug'ini berardi.
// Endi hamma shu yerdan oladi — divergensiya bo'lishi mumkin emas.

const FALLBACK = "https://rozgovoruz.bitrix24.kz/rest/527/8cmow72uy63s4ewg";

function resolve(): string {
  const url = process.env.BITRIX_WEBHOOK_URL || process.env.BITRIX_WEBHOOK;
  if (!url) {
    console.warn(
      "[bitrix-config] BITRIX_WEBHOOK_URL .env'da yo'q — fallback portalga tushildi. " +
        "Bu noto'g'ri portal bo'lishi mumkin; .env'da BITRIX_WEBHOOK_URL ni belgilang.",
    );
    return FALLBACK;
  }
  // Trailing slash → `${URL}/method.json` ikki slash bermasligi uchun.
  return url.replace(/\/+$/, "");
}

export const BITRIX_WEBHOOK_URL: string = resolve();
