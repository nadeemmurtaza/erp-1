import { Injectable } from '@nestjs/common';

@Injectable()
export class CartLineValidatorRegistry {
  private validators = new Map<string, (garmentFields: any, values: any) => any>();

  register(kind: string, validator: (garmentFields: any, values: any) => any) {
    this.validators.set(kind, validator);
  }

  validate(kind: string, garmentFields: any, values: any) {
    const validator = this.validators.get(kind);
    return validator ? validator(garmentFields, values) : values;
  }
}
