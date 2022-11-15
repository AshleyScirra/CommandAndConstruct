
// The ClientPlatform class represents the platform part of a ClientUnit,
// as a counterpart to a UnitPlatform class on GameServer.
export class ClientPlatform {
	
	// Private fields
	#unit;				// ClientUnit this platform belongs to
	#inst;				// Construct instance representing this platform
	#speed = 0;			// Current speed in px/s
	
	constructor(unit, x, y)
	{
		this.#unit = unit;
		
		// For now this is hard-coded to create a TankPlatform instance.
		const runtime = this.#unit.GetRuntime();
		this.#inst = runtime.objects.TankPlatform.createInstance("UnitPlatforms", x, y);
		
		// Use a tint on the instance to indicate the player: blue for player 0, and red for player 1.
		// TODO: come up with a better visualisation that can also extend to more players.
		if (this.#unit.GetPlayer() === 0)
			this.#inst.colorRgb = [0.5, 0.5, 1];
		else
			this.#inst.colorRgb = [1, 0.5, 0.5];
	}
	
	Release()
	{
		this.#inst.destroy();
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
	
	// The platform's image point locates where the turret is placed.
	GetTurretPosition()
	{
		return this.#inst.getImagePoint(1);
	}
	
	GetSize()
	{
		return [this.#inst.width, this.#inst.height];
	}
	
	SetSpeed(speed)
	{
		this.#speed = speed;
	}
	
	GetSpeed()
	{
		return this.#speed;
	}
	
	GetAngle()
	{
		return this.#inst.angle;
	}
	
	SetAngle(a)
	{
		this.#inst.angle = a;
	}
	
	Tick(dt)
	{
		// If the speed is nonzero, move the unit forwards.
		if (this.#speed !== 0)
		{
			const moveDist = this.#speed * dt;
			const [x, y] = this.GetPosition();
			const angle = this.GetAngle();
			this.SetPosition(x + Math.cos(angle) * moveDist, y + Math.sin(angle) * moveDist);
			
			// Update turret and selection box to follow platform movement
			this.#unit.GetTurret().Update();
			this.#unit.UpdateSelectionBox();
		}
	}
	
	ContainsPoint(x, y)
	{
		return this.#inst.containsPoint(x, y);
	}
}