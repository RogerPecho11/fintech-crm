import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('Error:', err);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  // Postgres errors
  if ((err as any).code === '23505') {
    res.status(409).json({ error: 'Record already exists' });
    return;
  }

  if ((err as any).code === '23503') {
    res.status(400).json({ error: 'Referenced record not found' });
    return;
  }

  res.status(500).json({ error: 'Internal server error' });
}
