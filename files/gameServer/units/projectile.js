
import { MovableObject } from "../classes/movableObject.js";

let nextId = 0;					// the ID to assign the next projectile

// The Projectile class represents something fired from turrets towards enemy units.
// It is a MovableObject as it has a position, angle and speed.
export class Projectile extends MovableObject {

	#turret;					// turret that fired this projectile
	#id = nextId++;				// assign incrementing ID to every projectile created
	#distanceTravelled = 0;		// how far this projectile has travelled
	
	constructor(turret, x, y)
	{
		super(turret.GetGameServer(), x, y);
		
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
	}
	
	// Projectiles should be destroyed once they travel out of range.
	ShouldDestroy()
	{
		return this.GetDistanceTravelled() > this.GetRange();
	}
}