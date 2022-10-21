
// This script just imports NetworkEvent and all kinds of derived network event classes.
// The derived classes add themselves as properties of NetworkEvent, e.g.
// NetworkEvent.FireProjectile, so there are no imports needed here; therefore the
// simple form of importing a script only to run it is used for those scripts.
import { NetworkEvent } from "./networkEvent.js";

// Derived classes are imported just to run the script
import "./fireProjectile.js";
import "./projectileHit.js";
import "./unitDestroyed.js";

// Re-export NetworkEvent, which now has other kinds of network events added,
// e.g. NetworkEvent.FireProjectile.
export { NetworkEvent };
