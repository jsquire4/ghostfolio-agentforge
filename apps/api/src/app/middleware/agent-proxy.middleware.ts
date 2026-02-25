import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response } from 'express';
import { request as httpRequest } from 'node:http';

const AGENT_PORT = process.env.AGENT_PORT ?? '8000';
const AGENT_HOST = process.env.AGENT_HOST ?? 'localhost';

@Injectable()
export class AgentProxyMiddleware implements NestMiddleware {
  private readonly logger = new Logger('AgentProxyMiddleware');

  public use(req: Request, res: Response) {
    // Rewrite /agent-api/... → /api/...
    const targetPath = req.originalUrl.replace(/^\/agent-api/, '/api');

    const proxyReq = httpRequest(
      {
        hostname: AGENT_HOST,
        port: AGENT_PORT,
        path: targetPath,
        method: req.method,
        headers: {
          ...req.headers,
          host: `${AGENT_HOST}:${AGENT_PORT}`
        }
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      }
    );

    proxyReq.on('error', (err) => {
      this.logger.error(`Agent proxy error: ${err.message}`);

      if (!res.headersSent) {
        res.status(502).json({ error: 'Agent unavailable' });
      }
    });

    req.pipe(proxyReq, { end: true });
  }
}
