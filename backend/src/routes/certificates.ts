import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { postCertificate } from '../controllers/certificate.controller';

const router = Router();

// POST /api/certificates — generate + download PDF certificate
router.post('/', authMiddleware, postCertificate);

export default router;
