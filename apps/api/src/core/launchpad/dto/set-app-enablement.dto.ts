import { IsBoolean } from 'class-validator';

export class SetAppEnablementDto {
  /** `true` shows the app on the launchpad; `false` hides it for the whole organization. */
  @IsBoolean()
  enabled!: boolean;
}
