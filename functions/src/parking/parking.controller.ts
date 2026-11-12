import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Actor, DemoAuthGuard } from '../common/demo-auth.guard';
import { IotInput, ParkingService, ReleaseInput } from './parking.service';
import { Persona, PERSONAS } from './parking.types';

@Controller('api/parking')
@UseGuards(DemoAuthGuard)
export class ParkingController {
  constructor(private readonly parking: ParkingService) {}

  @Get('overview')
  overview(@Query('since') since?: string) {
    const n = since !== undefined && /^\d+$/.test(since) ? Number(since) : undefined;
    return this.parking.overview(n);
  }

  @Get('personas')
  personas() {
    return PERSONAS;
  }

  @Post('bays/:bayId/release')
  @HttpCode(200)
  release(@Param('bayId') bayId: string, @Actor() actor: Persona, @Body() body: ReleaseInput) {
    return this.parking.release(bayId, actor, body ?? {});
  }

  @Post('bays/:bayId/reclaim')
  @HttpCode(200)
  reclaim(@Param('bayId') bayId: string, @Actor() actor: Persona) {
    return this.parking.reclaim(bayId, actor);
  }

  @Post('bays/:bayId/iot-event')
  @HttpCode(200)
  iotEvent(@Param('bayId') bayId: string, @Actor() actor: Persona, @Body() body: IotInput) {
    return this.parking.iotEvent(bayId, actor, body ?? {});
  }

  @Post('bays/:bayId/photo-coords')
  @HttpCode(200)
  photoCoords(@Param('bayId') bayId: string, @Body() body: { xPct?: unknown; yPct?: unknown; clear?: unknown }) {
    return this.parking.setPhotoCoords(bayId, body ?? {});
  }

  /** Explicit, user-triggered only. Never called automatically on page load. */
  @Post('demo/reset')
  @HttpCode(200)
  reset(@Actor() actor: Persona) {
    return this.parking.reset(actor);
  }
}
