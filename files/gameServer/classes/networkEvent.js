
// The NetworkEvent class represents a one-off event that happened, like a projectile being fired.
// All the events that happen in a tick are queued up and sent in one go as a binary events message.
// TODO: currently this only represents a "projectile fired" event. Soon it will be expanded
// to cover more kinds of events.
export class NetworkEvent {
	
	#projectile;			// projectile that was fired
	
	constructor(projectile)
	{
		this.#projectile = projectile;
	}
	
	Write(dataView, pos)
	{
		const projectile = this.#projectile;
		
		// Event type field. Currently just set to 0 for "projectile fired".
		dataView.setUint8(pos, 0);
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