import { Module } from '@nestjs/common';
import { HelloWorldListener } from './hello-world.listener';

/**
 * docs/implementation/SDK-CONTRACT.md's own reference pack (WO-37.4).
 * Registered in `module-packs.ts` under the `'example'` pack — never
 * `'core'` — so `check-module-boundaries.mjs` enforces the real DIRECTION
 * rule against it ("a pack module may never import another pack's
 * module"), the same boundary an actual third-party sector pack would be
 * held to. Registered `offByDefault: true` in `modules.registry.ts`: a
 * demonstration, never production scope.
 */
@Module({
  providers: [HelloWorldListener],
})
export class ExampleHelloWorldPackModule {}
