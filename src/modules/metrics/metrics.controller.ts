import {
  Controller,
  Get,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { register } from './metrics.registry';

@Controller('metrics')
export class MetricsController {
  @Get()
  async getMetrics(@Req() req: Request, @Res() res: Response): Promise<void> {
    const token = process.env.METRICS_TOKEN;
    if (token && req.header('x-metrics-token') !== token) {
      throw new UnauthorizedException();
    }

    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
  }
}
