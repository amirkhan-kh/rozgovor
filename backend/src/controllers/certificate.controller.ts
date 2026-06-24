import { Request, Response } from 'express';
import { generateCertificate } from '../services/certificate.service';

export async function postCertificate(req: Request, res: Response): Promise<void> {
  const { name } = req.body as { name?: string };
  if (!name || !name.trim()) {
    res.status(400).json({ success: false, message: 'Ism va familiya kiritilmagan' });
    return;
  }
  try {
    const pdfBytes = await generateCertificate(name.trim());
    const safeName = name.trim().replace(/[^a-zA-Z0-9 '_-]/g, '_').slice(0, 60);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Sertifikat-${safeName}.pdf"`);
    res.setHeader('Content-Length', pdfBytes.length);
    res.end(Buffer.from(pdfBytes));
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || 'PDF yaratishda xatolik' });
  }
}
