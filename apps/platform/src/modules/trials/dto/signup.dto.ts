import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** WO-51.2 — the public self-service signup request. Deliberately narrow:
 *  no `resourceTier`, no `trialDays` — those are policy decisions this
 *  form never gets to make for itself. */
export class RequestSignupDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(63)
  @Matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
    message: 'slug must be lowercase alphanumeric with hyphens, matching a valid subdomain label',
  })
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  legalName!: string;

  @IsString()
  planKey!: string;
}

export class VerifySignupDto {
  @IsString()
  @MinLength(1)
  token!: string;
}
