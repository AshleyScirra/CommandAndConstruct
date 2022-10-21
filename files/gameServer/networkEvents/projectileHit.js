
import { NetworkEvent } from "./networkEvent.js";

// The ProjectileHit event represents a projectile hitting a target, such as a
// different player's unit. Note that when this happens the projectile is destroyed
// on the server side, and the event isn't sent until the end of the tick, so
// the details about the projectile are saved inside the class.
NetworkEvent.ProjectileHit = class ProjectileHit extends NetworkEvent {
	
	#id = 0;		// projectile ID
	#x = 0;			// projectile position
	#y = 0;
	
	constructor(projectile)
	{
		super();
		
		// Save the details about the projectile, as it's about to be destroyed.
		this.#id = projectile.GetId();
		
		const [x, y] = projectile.GetPosition();
		this.#x = x;
		this.#y = y;
	}
	
	Write(dataView, pos)
	{
		// Event type
		dataView.setUint8(pos, NetworkEvent.TYPE_PROJECTILE_HIT);
		pos += 1;
		
		// Projectile ID
		dataView.setUint16(pos, this.#id);
		pos += 2;
		
		// X and Y positions
		dataView.setFloat32(pos, this.#x);
		pos += 4;
		dataView.setFloat32(pos, this.#y);
		pos += 4;
		
		return pos;
	}
}