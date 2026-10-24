import { IsOptional, IsString, Matches } from 'class-validator';

/**
 * WO-14.1's own "manual, deliberate step" — an ops principal opens this
 * once, when the agency actually signs a client, against a `PlatformTenant`
 * that already exists (provisioned through the normal `POST /tenants`
 * flow). Every field is optional: a client onboarded before their mailbox
 * or Stripe account exists still gets an `AGENCY_API_KEY` today and the
 * rest filled in later via `PATCH /agency/clients/:id`.
 */
export class RegisterAgencyClientDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9.-]+\.[a-z]{2,}$/i, { message: 'mailDomain must be a bare domain, e.g. acme.example.com' })
  mailDomain?: string;

  @IsOptional()
  @IsString()
  stripeCustomerId?: string;

  @IsOptional()
  @IsString()
  stripeSubscriptionId?: string;
}

/** `PATCH /agency/clients/:id` — updates the same fields post-registration
 *  without minting a new API key (that's `rotate-key`'s own job). */
export class UpdateAgencyClientDto extends RegisterAgencyClientDto {}
