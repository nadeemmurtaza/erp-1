import { Global, Module } from '@nestjs/common';
import { CartLineValidatorRegistry } from './cart-line-validator.registry';
import { EntityEnrichmentRegistry } from './entity-enrichment.registry';
import { StockIntakeRegistry } from './stock-intake.registry';
import { BranchPolicyRegistry } from './branch-policy.registry';
import { CameraPeopleCountRegistry } from './camera-people-count.registry';
import { IdentityVerificationStatusRegistry } from './identity-verification-status.registry';
import { EmployeeOffboardingRegistry } from './employee-offboarding.registry';
import { TaskSourceRegistry } from './task-source.registry';
import { CheckoutValidatorRegistry } from '../checkout/checkout-validator.registry';
import { WorkflowStepsRegistry } from './workflow-steps.registry';
import { AuctionOrderSinkRegistry } from './auction-order-sink.registry';

/**
 * The seams a module uses to reach another module without importing it
 * directly — see EntityEnrichmentRegistry, CheckoutValidatorRegistry,
 * CartLineValidatorRegistry, StockIntakeRegistry and BranchPolicyRegistry
 * for what each is for. Most of these decouple core from a sector pack;
 * StockIntakeRegistry, BranchPolicyRegistry, EmployeeOffboardingRegistry,
 * TaskSourceRegistry, WorkflowStepsRegistry and AuctionOrderSinkRegistry decouple two core modules
 * from each other, but the mechanism and the reason are the same. Global, like every other core
 * module, so any module injects any of them directly rather than importing
 * this module.
 */
@Global()
@Module({
  providers: [
    EntityEnrichmentRegistry,
    CheckoutValidatorRegistry,
    CartLineValidatorRegistry,
    StockIntakeRegistry,
    BranchPolicyRegistry,
    CameraPeopleCountRegistry,
    IdentityVerificationStatusRegistry,
    EmployeeOffboardingRegistry,
    TaskSourceRegistry,
    WorkflowStepsRegistry,
    AuctionOrderSinkRegistry,
  ],
  exports: [
    EntityEnrichmentRegistry,
    CheckoutValidatorRegistry,
    CartLineValidatorRegistry,
    StockIntakeRegistry,
    BranchPolicyRegistry,
    CameraPeopleCountRegistry,
    IdentityVerificationStatusRegistry,
    EmployeeOffboardingRegistry,
    TaskSourceRegistry,
    WorkflowStepsRegistry,
    AuctionOrderSinkRegistry,
  ],
})
export class ExtensionPointsModule {}
