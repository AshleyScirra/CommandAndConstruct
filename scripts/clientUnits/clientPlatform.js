
// The ClientPlatform class represents the platform part of a ClientUnit,
// as a counterpart to a UnitPlatform class on GameServer.
export class ClientPlatform {
	
	// Private fields
	#unit;				// ClientUnit this platform belongs to
	#inst;				// Construct instance representing this platform
	
	constructor(unit, x, y)
	{
		this.#unit = unit;
		
		// For now this is hard-coded to create a TankPlatform instance.
		const runtime = this.#unit.GetRuntime();
		this.#inst = runtime.objects.TankPlatform.createInstance("UnitPlatforms", x, y);
	}
	
	// Position, size, angle and collisions use the corresponding Construct instance.
	GetPosition()
	{
		return [this.#inst.x, this.#inst.y];
	}
	
	SetPosition(x, y)
	{
		this.#inst.x = x;
		this.#inst.y = y;
	}
	
	GetSize()
	{
		return [this.#inst.width, this.#inst.height];
	}
	
	GetAngle()
	{
		return this.#inst.angle;
	}
	
	SetAngle(a)
	{
		this.#inst.angle = a;
	}
	
	ContainsPoint(x, y)
	{
		return this.#inst.containsPoint(x, y);
	}
}