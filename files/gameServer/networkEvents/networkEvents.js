// This script just imports NetworkEvent and all kinds of derived network event classes,
// and then re-exports them all.
import { NetworkEvent } from "./networkEvent.js";
// Derived classes are imported just to run the script
import { FireProjectileEvent } from "./fireProjectile.js";
import { ProjectileHitEvent } from "./projectileHit.js";
import { UnitDestroyedEvent } from "./unitDestroyed.js";
export { NetworkEvent, FireProjectileEvent, ProjectileHitEvent, UnitDestroyedEvent };
