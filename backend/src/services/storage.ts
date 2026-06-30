import AWS from "aws-sdk";
import { v4 as uuidv4 } from "uuid";

// Yandex Object Storage — barcha audio fayllar uchun storage.
const YANDEX_ENDPOINT = process.env.YANDEX_STORAGE_ENDPOINT || "https://storage.yandexcloud.net";
// Pipeline qolgani (STT, batch-backfill, lesson-processor) YANDEX_BUCKET'dan o'qiydi.
// YANDEX_BUCKET_AUDIO o'rnatilmagan bo'lsa shu yagona bucketga (baxtlinikoh) tushishi shart —
// aks holda fayl boshqa bucketga yuklanadi va prod credlari ruxsat bermay 500 qaytaradi.
const YANDEX_BUCKET =
  process.env.YANDEX_BUCKET_AUDIO || process.env.YANDEX_BUCKET || "sales-ai-storage";
const YANDEX_URL_PREFIX = `${YANDEX_ENDPOINT}/${YANDEX_BUCKET}/`;

const yandexS3 = new AWS.S3({
  endpoint: YANDEX_ENDPOINT,
  accessKeyId: process.env.YANDEX_STORAGE_KEY_ID,
  secretAccessKey: process.env.YANDEX_STORAGE_SECRET,
  region: "ru-central1",
  s3ForcePathStyle: true,
  signatureVersion: "v4",
});

const AUDIO_KEY_PREFIX = "audio/";

export const uploadFile = async (
  buffer: Buffer,
  companyId: string,
  mimeType: string,
  extension = "mp3"
): Promise<{ url: string; key: string }> => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const key = `${AUDIO_KEY_PREFIX}${companyId}/${year}/${month}/${uuidv4()}.${extension}`;

    await yandexS3
      .putObject({
        Bucket: YANDEX_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      })
      .promise();

    const url = `${YANDEX_URL_PREFIX}${key}`;
    return { url, key };
  } catch (err) {
    console.error("Yandex S3 upload error:", err);
    throw new Error("Faylni yuklashda xatolik yuz berdi");
  }
};

export const getFileBuffer = async (key: string): Promise<Buffer> => {
  try {
    const result = await yandexS3
      .getObject({ Bucket: YANDEX_BUCKET, Key: key })
      .promise();
    return result.Body as Buffer;
  } catch (err) {
    console.error("Yandex S3 download error:", err);
    throw new Error("Faylni yuklashda xatolik yuz berdi");
  }
};

export const deleteFile = async (key: string): Promise<void> => {
  try {
    await yandexS3.deleteObject({ Bucket: YANDEX_BUCKET, Key: key }).promise();
  } catch (err) {
    console.error("Yandex S3 delete error:", err);
    throw new Error("Faylni o'chirishda xatolik yuz berdi");
  }
};

export const getKeyFromUrl = (url: string): string => {
  if (url.startsWith(YANDEX_URL_PREFIX)) return url.slice(YANDEX_URL_PREFIX.length);
  return url;
};
