import { CanActivate, createParamDecorator, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Persona, PERSONAS, PersonaKey } from '../parking/parking.types';

/**
 * Demo stand-in for the production AuthGuard + AppCheckGuard.
 * The hackathon build has no real sign-in: the caller states which of the three
 * demo personas it is acting as in the `x-demo-persona` header.
 */
@Injectable()
export class DemoAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const raw = req.headers['x-demo-persona'];
    const key = (Array.isArray(raw) ? raw[0] : raw) ?? (String(req.path).startsWith('/api/mcp') ? 'owner' : 'commuter');
    if (!Object.prototype.hasOwnProperty.call(PERSONAS, key)) throw new UnauthorizedException('x-demo-persona must be owner, commuter or management.');
    req.actor = PERSONAS[key as PersonaKey];
    return true;
  }
}

export const Actor = createParamDecorator((_: unknown, ctx: ExecutionContext): Persona => ctx.switchToHttp().getRequest().actor);
