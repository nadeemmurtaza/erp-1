import { Body, Controller, Ip, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SignupService } from './signup.service';
import { RequestSignupDto, VerifySignupDto } from './dto/signup.dto';

// WO-51.2's own "rate-limited... at the edge" — a tighter throttle than
// this app's global default (see AppModule), matching the shape
// apps/api's own auth.controller.ts uses for its public credential routes.
const SIGNUP_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

/**
 * One of two unauthenticated controllers in this app — the other is doc
 * 154's `PricingController`, a pure read with no side effect at all. Doc
 * 51 §"the principal with no permission key": nobody has an account yet
 * here either, so THIS controller is bounded by rate limiting and email
 * verification, never `OpsAuthGuard`, which is the correct, named
 * exception rather than an oversight.
 */
@Controller('signup')
export class SignupController {
  constructor(private readonly signup: SignupService) {}

  @Throttle(SIGNUP_THROTTLE)
  @Post()
  request(@Body() dto: RequestSignupDto, @Ip() ip: string) {
    return this.signup.requestSignup(dto, ip);
  }

  @Throttle(SIGNUP_THROTTLE)
  @Post('verify')
  verify(@Query() query: VerifySignupDto) {
    return this.signup.verifyAndProvision(query.token);
  }
}
