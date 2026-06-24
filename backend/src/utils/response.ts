import { Response } from "express";

export const success = (res: Response, data: unknown, status = 200): void => {
  res.status(status).json({
    success: true,
    data,
  });
};

export const error = (res: Response, message: string, status = 500): void => {
  res.status(status).json({
    success: false,
    error: message,
  });
};
