import { IsISO8601, IsString, MaxLength, MinLength } from 'class-validator';

/** WO-39.5 — issuing a grant never accepts `approvedByUserId`: approval is
 *  always a separate action (see ApproveGrantDto), which is what makes the
 *  self-approval refusal structural rather than a value the issuer could
 *  simply fill in themselves. */
export class IssueGrantDto {
  @IsString()
  @MinLength(1)
  tenantId!: string;

  /** The Newax support engineer this grant is for. */
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  grantedToUserId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;

  @IsISO8601()
  expiresAt!: string;
}

export class ApproveGrantDto {
  @IsString()
  @MinLength(1)
  approvedByUserId!: string;
}
