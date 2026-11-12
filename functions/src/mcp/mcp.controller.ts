import { Body, Controller, Get, HttpCode, HttpException, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Actor, DemoAuthGuard } from '../common/demo-auth.guard';
import { Persona } from '../parking/parking.types';
import { McpService } from './mcp.service';

/** Minimal stateless MCP endpoint (JSON-RPC 2.0 over HTTP POST, JSON responses). */
@Controller('api/mcp')
@UseGuards(DemoAuthGuard)
export class McpController {
  constructor(private readonly mcp: McpService) {}

  @Post()
  @HttpCode(200)
  post(@Body() body: unknown, @Actor() actor: Persona, @Res() res: Response) {
    const batch = Array.isArray(body);
    const messages = batch ? (body as unknown[]).slice(0, 20) : [body];
    const replies = messages.map((m) => this.mcp.handle(m, actor)).filter((r) => r !== null);
    if (replies.length === 0) return res.status(202).end();
    return res.json(batch ? replies : replies[0]);
  }

  @Get()
  get() {
    throw new HttpException('This MCP endpoint is stateless: use POST with a JSON-RPC 2.0 body.', 405);
  }
}
