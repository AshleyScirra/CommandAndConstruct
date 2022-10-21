
import { NetworkEvent } from "./networkEvent.js";

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
		
		// Write, X, Y, angle, speed, range and distance travelled
		// TODO: try to shrink some of these values to 16 bits to save bandwidth
		const [x, y] = projectile.GetPosition();
		dataView.setFloat32(pos, x);
		pos += 4;
		dataView.setFloat32(pos, y);
		pos += 4;
		dataView.setFloat32(pos, projectile.GetAngle());
		pos += 4;
		dataView.setFloat32(pos, projectile.GetSpeed());
		pos += 4;
		dataView.setFloat32(pos, projectile.GetRange());
		pos += 4;
		dataView.setFloat32(pos, projectile.GetDistanceTravelled());
		pos += 4;
		
		return pos;
	}
}