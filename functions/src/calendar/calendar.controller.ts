import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Actor, DemoAuthGuard } from '../common/demo-auth.guard';
import { CalendarInput, ParkingService } from '../parking/parking.service';
import { Persona } from '../parking/parking.types';

/**
 * Mock Google Calendar link. In production this would be a Google Calendar push
 * notification (webhook) per user; here the "calendar update" is posted by the demo UI.
 * The calendar itself is returned inside GET /api/parking/overview.
 */
@Controller('api/calendar')
@UseGuards(DemoAuthGuard)
export class CalendarController {
  constructor(private readonly parking: ParkingService) {}

  @Post('events')
  @HttpCode(200)
  add(@Actor() actor: Persona, @Body() body: CalendarInput) {
    return this.parking.addCalendarEvent(actor, body ?? {});
  }

  @Post('events/:eventId/remove')
  @HttpCode(200)
  remove(@Param('eventId') eventId: string, @Actor() actor: Persona) {
    return this.parking.removeCalendarEvent(eventId, actor);
  }

  @Post('suggestions/:eventId/accept')
  @HttpCode(200)
  accept(@Param('eventId') eventId: string, @Actor() actor: Persona) {
    return this.parking.respondToSuggestion(eventId, actor, true);
  }

  @Post('suggestions/:eventId/decline')
  @HttpCode(200)
  decline(@Param('eventId') eventId: string, @Actor() actor: Persona) {
    return this.parking.respondToSuggestion(eventId, actor, false);
  }
}
