import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['log', 'warn', 'error'], bodyParser: false });
  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // Mantine sets inline style attributes
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  app.use(express.json({ limit: '32kb' }));

  // The demo has no sign-in, so keep abuse bounded: generous for polling, tighter for writes.
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 1500, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many requests. Please slow down.' } }));
  app.use(
    '/api',
    rateLimit({ windowMs: 60_000, limit: 180, skip: (req) => req.method === 'GET', standardHeaders: true, legacyHeaders: false, message: { message: 'Too many changes in a short time. Please wait a minute.' } }),
  );

  // Built React client (single process serves API + SPA).
  const clientDist = path.resolve(process.env.CLIENT_DIST ?? path.join(__dirname, '../../client/dist'));
  const indexHtml = path.join(clientDist, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(
      express.static(clientDist, {
        index: false,
        setHeaders: (res, file) => res.setHeader('Cache-Control', file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache'),
      }),
    );
    app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/api')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  }

  const port = Number(process.env.PORT ?? 3600);
  const host = process.env.HOST ?? '127.0.0.1';
  await app.listen(port, host);
  console.log(`SmartPark listening on http://${host}:${port}`);
}

void bootstrap();
