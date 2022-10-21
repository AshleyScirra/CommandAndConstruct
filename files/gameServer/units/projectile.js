
import { MovableObject } from "../classes/movableObject.js";

// Like unit IDs, projectile IDs are sent as a uint16 value to save on bandwidth,
// allowing for around 65k active projectiles in the entire game at any one time,
// which should (?!) be enough. The same allocation scheme is used as for units -
// despite the fact it's unlikely any old projectiles will still be around after
// the ID wraps around, it's easy enough to handle that case anyway.
let nextId = 0;					// the ID to assign the next projectile

function GetNewProjectileId(gameServer)
{
	// Keep incrementing the ID so long as the ID is still in use.
	do {
		nextId++;
		
		// Wrap around if reached the limit of uint16
		if (nextId === 65536)
			nextId = 0;
	}
	while (gameServer.HasProjectileId(nextId));
	
	return nextId;
}

// The Projectile class represents something fired from turrets towards enemy units.
// It is a MovableObject as it has a position, angle and speed.
export class Projectile extends MovableObject {

	#turret;					// turret that fired this projectile
	#id = -1;					// unique ID for this unit (determined in constructor)
	#distanceTravelled = 0;		// how far this projectile has travelled
	#didHitTarget = false;		// set to true if hit a target
	#damage = 10;				// amount of damage this projectile does
	
	constructor(turret, x, y)
	{
		const gameServer = turret.GetGameServer();
		super(gameServer, x, y);
		
		this.#id = GetNewProjectileId(gameServer);
		this.#turret = turret;
	}
	
	Release()
	{
	}
	
	GetId()
	{
		return this.#id;
	}
	
	SetDistanceTravelled(d)
	{
		this.#distanceTravelled = d;
	}
	
	GetDistanceTravelled()
	{
		return this.#distanceTravelled;
	}
	
	GetRange()
	{
		return this.#turret.GetRange();
	}
	
	GetPlayer()
	{
		return this.#turret.GetUnit().GetPlayer();
	}
	
	GetDamage()
	{
		return this.#damage;
	}
	
	Tick(dt)
	{
		// Move the projectile at its angle and speed.
		const [x, y] = this.GetPosition();
		const a = this.GetAngle();
		const moveDist = this.GetSpeed() * dt;
		const dx = Math.cos(a) * moveDist;
		const dy = Math.sin(a) * moveDist;
		this.SetPosition(x + dx, y + dy);
		
		// Increment the distance travelled measurement, so it knows
		// when it's gone out of range.
		this.#distanceTravelled += Math.hypot(dx, dy);
		
		// Check if this projectile hit an enemy unit. If it did,
		// mark that this projectile should be destroyed.
		if (this.GetGameServer().CheckProjectileCollision(this))
		{
			this.#didHitTarget = true;
		}
	}
	
	// Projectiles should be destroyed once they travel out of range or hit a target.
	ShouldDestroy()
	{
		return this.GetDistanceTravelled() > this.GetRange() || this.#didHitTarget;
	}
}