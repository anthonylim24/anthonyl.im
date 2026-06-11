import { Context, MiddlewareHandler } from 'hono';

export const errorHandler: MiddlewareHandler = async (c: Context, next) => {
  try {
    await next();
  } catch (error) {
    console.error('Error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      path: c.req.path,
      method: c.req.method,
    });

    const status = error instanceof Error && 'status' in error ? Number(error.status) : 500;
    const expose = status >= 400 && status < 500;
    return c.json(
      {
        success: false,
        error: expose && error instanceof Error ? error.message : 'Internal server error',
      },
      status as any
    );
  }
};
