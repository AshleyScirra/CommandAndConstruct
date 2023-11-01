
import { GameClient } from "../gameClient/gameClient.js";

// The ClientProjectile class represents a projectile for GameClient. It is the client-side
// counterpart to the Projectile class on the game server. Note that ClientProjectile does not
// actually implement any real game logic such as collision detection: it only exists to
// display to the player where projectiles are. It is created and destroyed to match what
// happens on the game server and that's pretty much it.
export class ClientProjectile {

	#gameClient;
	#id = -1;			// Projectile ID
	#inst;				// Construct object instance
	#speed = 0;
	#range = 0;
	#distanceTravelled = 0;
	
	constructor(gameClient: GameClient, id: number, x: number, y: number, angle: number, speed: number, range: number, distanceTravelled: number)
	{
		this.#gameClient = gameClient;
		this.#id = id;
		
		// Create a Construct object to represent this projectile
		const runtime = gameClient.GetRuntime();
		this.#inst = runtime.objects.TankShell.createInstance("Projectiles", x, y);
		this.#inst.angle = angle;
		
		this.#speed = speed;
		this.#range = range;
		this.#distanceTravelled = distanceTravelled;
	}
	
	Release()
	{
		this.#inst.destroy();
	}
	
	GetPosition()
	{
		return this.#inst.getPosition();
	}
	
	Tick(dt: number)
	{
		// Advance the projectile at its speed and angle
		const moveDist = this.#speed * dt;
		const angle = this.#inst.angle;
		const dx = Math.cos(angle) * moveDist;
		const dy = Math.sin(angle) * moveDist;
		this.#inst.x += dx;
		this.#inst.y += dy;
		
		// Also increment the distance travelled. This is so the client can automatically
		// destroy projectiles that go out of range instead of needing GameServer to tell
		// it to do so.
		this.#distanceTravelled += Math.hypot(dx, dy);
	}
	
	ShouldDestroy()
	{
		return this.#distanceTravelled > this.#range;
	}
}