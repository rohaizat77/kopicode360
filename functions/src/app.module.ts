import { Controller, Get, Module } from '@nestjs/common';
import { CalendarController } from './calendar/calendar.controller';
import { DemoAuthGuard } from './common/demo-auth.guard';
import { McpController } from './mcp/mcp.controller';
import { McpService } from './mcp/mcp.service';
import { ParkingController } from './parking/parking.controller';
import { ParkingService } from './parking/parking.service';

@Controller('api/health')
class HealthController {
  @Get()
  health() {
    return { ok: true, service: 'smartpark', time: new Date().toISOString() };
  }
}

@Module({
  controllers: [HealthController, ParkingController, CalendarController, McpController],
  providers: [ParkingService, McpService, DemoAuthGuard],
})
export class AppModule {}
