
import { NetworkEvent } from "./networkEvent.js";
import * as MathUtils from "../utils/mathUtils.js";

// The FireProjectile event represents a projectile being fired from a turret.
NetworkEvent.FireProjectile = class FireProjectile extends NetworkEvent {
	
	#projectile;			// projectile that was fired
	
	constructor(projectile)
	{
		super();
		
		this.#projectile = projectile;
	}
	
	Write(dataView, pos)
	{
		const projectile = this.#projectile;
		
		// Event type
		dataView.setUint8(pos, NetworkEvent.TYPE_FIRE_PROJECTILE);
		pos += 1;
		
		// Projectile ID
		dataView.setUint16(pos, projectile.GetId());
		pos += 2;
		
		// Write, X, Y, angle, speed, range and distance travelled as uint16s
		const [x, y] = projectile.GetPosition();
		dataView.setUint16(pos, x);
		pos += 2;
		dataView.setUint16(pos, y);
		pos += 2;
		dataView.setUint16(pos, MathUtils.AngleToUint16(projectile.GetAngle()));
		pos += 2;
		dataView.setUint16(pos, projectile.GetSpeed());
		pos += 2;
		dataView.setUint16(pos, projectile.GetRange());
		pos += 2;
		dataView.setUint16(pos, projectile.GetDistanceTravelled());
		pos += 2;
		
		return pos;
	}
}