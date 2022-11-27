
import { PositionedAndAngledObject } from "../classes/positionedAndAngledObject.js";
import { Projectile } from "./projectile.js";
import * as MathUtils from "../utils/mathUtils.js";

const _2PI = 2 * Math.PI;

// The amount of rotation difference before a turret sends a delta update for its angle,
// currently set to 0.5 degrees.
const TURRET_SEND_ANGLE_THRESHOLD = MathUtils.ToRadians(0.5);

// A UnitTurret is the firing part of a unit, that rotates independently of the platform
// to aim and fire projectiles at other player's units.
// Note that importantly the UnitTurret position and angle are treated as offsets
// from the platform. That means when the platform moves and rotates, the turret
// automatically moves and rotates with it.
export class UnitTurret extends PositionedAndAngledObject {

	// Private fields
	#unit;					// reference to Unit
	#targetUnitId = -1;		// ID of unit turret is targeting, or -1 if none
	
	#range = 1400;			// maximum range to identify a target
	#rotateSpeed = MathUtils.ToRadians(70);
	
	// The accuracy is a random adjustment to the projectile angle when firing.
	// A value of 0 means perfect accuracy, and higher values mean less accurate firing.
	#accuracy = MathUtils.ToRadians(8);
	
	#lastFireTime = 0;		// game time when last shot was fired
	#rateOfFire = 2;		// number of seconds between shots
	#projectileSpeed = 900;	// speed projectile travels at
	
	// Turrets only send delta updates on their angle when it changes past a threshold,
	// in order to reduce bandwidth.
	#lastSentAngle = 0;
	
	constructor(unit, x, y)
	{
		super(unit.GetGameServer(), x, y);
		
		this.#unit = unit;
	}
	
	Release()
	{
		// not yet used
	}
	
	GetUnit()
	{
		return this.#unit;
	}
	
	GetPlatform()
	{
		return this.GetUnit().GetPlatform();
	}
	
	// The turret's own angle is relative to the platform.
	// The overall angle returns its actual angle taking in to account the platform angle.
	GetOverallAngle()
	{
		return this.GetPlatform().GetAngle() + this.GetAngle();
	}
	
	// Override SetAngle() to call MarkTurretOffsetAngleChanged() on the unit
	// when the angle is changed.
	SetAngle(a)
	{
		// Wrap the angle the same way it is in PositionedAndAngledObject
		// to ensure the subsequent comparison works as intended
		a = a % _2PI;
		if (a < 0)
			a += _2PI;
		
		if (a === this.GetAngle())
			return;		// no change
		
		super.SetAngle(a);
		
		// When testing intense combat, turret angle changes consumed a great deal of
		// bandwidth in delta updates. The turret angle is actually purely cosmetic:
		// when projectiles are fired, the network event includes the true angle of the
		// projectile. Therefore the resolution of turret offset angles can be decreased
		// without meaningfully affecting the client-side representation. Rather than
		// sending turret offset angles whenever they change, instead they must rotate
		// beyond a minimum threshold before it sends a delta update. This is currently
		// set at 0.5 degrees, so the turret will only send an update when it rotates
		// more than that amount from the last angle that was sent over the network.
		// This appears to reduce the bandwidth requirement by up to two thirds, and
		// clients will be able to interpolate smoothly over small differences anyway.
		if (MathUtils.AngleDifference(this.#lastSentAngle, this.GetAngle()) >= TURRET_SEND_ANGLE_THRESHOLD)
		{
			this.#unit.MarkTurretOffsetAngleChanged();
			this.#lastSentAngle = this.GetAngle();
		}
	}
	
	// When a full update is sent for the turret, update the last set angle again, so
	// a delta update will only be sent if it rotates significantly away from this angle.
	OnSentFullUpdate()
	{
		this.#lastSentAngle = this.GetAngle();
	}
	
	GetRange()
	{
		return this.#range;
	}
	
	GetProjectileSpeed()
	{
		return this.#projectileSpeed;
	}
	
	Tick(dt)
	{
		if (this.#targetUnitId === -1)
			this.#FindTarget(dt);
		else
			this.#TrackTarget(dt);
	}
	
	// Identify if there is a unit this turret can target in range.
	// If there are multiple targets, it will try to find the best one to target.
	#FindTarget(dt)
	{
		const forPlayer = this.GetUnit().GetPlayer();
		
		// Note the turret determines range from the platform position rather than its own position.
		// Since it detects targets by the platform position, it must find range from its own platform
		// position, otherwise an offset turret position can make it possible for a turret to fire
		// at a target that can't fire back.
		const [fromX, fromY] = this.GetPlatform().GetPosition();
		
		// Collect all available targets in range.
		const availableTargets = [];
		
		// Iterating every unit in the game would be extremely inefficient, leading to an O(n^2) number
		// of checks. Instead only check the contents of the collision cells that the range covers.
		// This covers a square area that may be larger than the actual range circle, but it checks
		// the circular range inside the callback, and the most important thing is it will skip
		// most units in the game, making it far more efficient. Also note that ForEachItemInArea()
		// can run the callback multiple times with the same unit platform. However this does not
		// matter; if availableTargets has duplicates, it will fall through to picking the best one
		// by nearest angular difference to the turret, and that algorithm works the same with duplicates.
		this.GetGameServer().GetCollisionGrid().ForEachItemInArea(
			fromX - this.#range, fromY - this.#range, fromX + this.#range, fromY + this.#range,
			unitPlatform =>
			{
				// Skip units from the same player
				const unit = unitPlatform.GetUnit();
				if (unit.GetPlayer() === forPlayer)
					return;

				// Check if this unit is within range.
				// Use square distances to avoid computing a square root.
				const [toX, toY] = unitPlatform.GetPosition();
				const dx = toX - fromX;
				const dy = toY - fromY;
				if (dx * dx + dy * dy <= this.#range * this.#range)
				{
					// Found a target. Add it to the list of available targets.
					// Keep looking for further available targets.
					availableTargets.push(unit);
				}
			});
		
		// Did not find a target. Rotate the turret back to angle 0,
		// so it returns to its default orientation with the unit platform.
		if (availableTargets.length === 0)
		{
			this.SetAngle(MathUtils.AngleRotate(this.GetAngle(), 0, this.#rotateSpeed * dt));
		}
		// Only found one available target. Just aim for that.
		else if (availableTargets.length === 1)
		{
			this.#targetUnitId = availableTargets[0].GetId();
		}
		// Multiple targets are available in range.
		else
		{
			// When multiple targets are available, aim for the one that requires the least
			// rotation by the turret. This avoids things like rotating the turret all the way around
			// in the opposite direction to fire at something behind the unit when there is already
			// a target in front of the unit, saving time in combat. Therefore we need to find the
			// target with the minimum angular distance from the current turret angle.
			// Note the availableTargets array could contain duplicates due to the way collision cells
			// work; however this does not matter with this algorithm, it will work the same anyway.
			const turretAngle = this.GetOverallAngle();
			
			// Find the "best" target, i.e. the one with the least angular distance from the turret.
			let bestTargetUnit = null;
			let bestTargetAngleDist = Infinity;		// start with Infinity so first target always beats this
			
			for (const unit of availableTargets)
			{
				// Find this available target's angular distance from the turret angle.
				const [targetX, targetY] = unit.GetPlatform().GetPosition();
				const angleToTarget = MathUtils.AngleTo(fromX, fromY, targetX, targetY);
				const angleDist = MathUtils.AngleDifference(turretAngle, angleToTarget);
				
				// If this target has a smaller angular distance to the turret angle than the current best,
				// then replace it as the best target.
				if (angleDist < bestTargetAngleDist)
				{
					bestTargetUnit = unit;
					bestTargetAngleDist = angleDist;
				}
			}
			
			// Now the best target is set to the available target with the smallest angular distance to the turret's current angle.
			// Start targeting that unit.
			this.#targetUnitId = bestTargetUnit.GetId();
		}
	}
	
	#TrackTarget(dt)
	{
		const gameServer = this.GetGameServer();
		
		// Find the unit this turret is tracking.
		const unit = gameServer.GetUnitById(this.#targetUnitId);
		
		// If the unit is not found, assume it was destroyed.
		// Reset to having no target and bail out.
		if (!unit)
		{
			this.#targetUnitId = -1;
			return;
		}
		
		// Check the target is still in range.
		const [platformX, platformY] = this.GetPlatform().GetPosition();
		const [targetX, targetY] = unit.GetPlatform().GetPosition();
		const dx = targetX - platformX;
		const dy = targetY - platformY;
		if (dx * dx + dy * dy > this.#range * this.#range)
		{
			this.#targetUnitId = -1;
			return;
		}
		
		// Get the angle to the target
		const [turretX, turretY] = this.GetPlatform().GetTurretPosition();
		const targetAngle = MathUtils.AngleTo(turretX, turretY, targetX, targetY);
		
		// Rotate towards the target. Note that the angle rotation is done in terms
		// of the overall angle, but the turret angle is set to an angle relative
		// to the platform angle.
		const platformAngle = this.GetPlatform().GetAngle();
		const myAngle = platformAngle + this.GetAngle();
		const rotatedAngle = MathUtils.AngleRotate(myAngle, targetAngle, this.#rotateSpeed * dt);
		this.SetAngle(rotatedAngle - platformAngle);
		
		// If the turret is now facing at its target (within a tiny threshold to allow for
		// precision errors), and it has reloaded, then fire a projectile.
		if (MathUtils.AngleDifference(targetAngle, rotatedAngle) < MathUtils.ToRadians(0.01) &&
			gameServer.GetGameTime() >= this.#lastFireTime + this.#rateOfFire)
		{
			this.#FireProjectile();
		}
	}
	
	// Called when the turret is to shoot its projectile.
	#FireProjectile()
	{
		const gameServer = this.GetGameServer();
		
		// Get the turret image point, which is where the projectile is fired from.
		// Rotate the image point by the angle the turret is currently pointing at,
		// since the image point position is based on an angle of 0.
		const turretObjectData = gameServer.GetObjectData("TankTurret");
		const angle = this.GetOverallAngle();
		let [imgPtX, imgPtY] = turretObjectData.GetImagePoint();
		[imgPtX, imgPtY] = MathUtils.RotatePoint(imgPtX, imgPtY, angle);
		
		// The projectile position is then the turret position offset by its
		// rotated image point.
		const [turretX, turretY] = this.GetPlatform().GetTurretPosition();
		const x = turretX + imgPtX;
		const y = turretY + imgPtY;
		
		// Create the projectile and set its properties for the type of projectile
		// fired by this turret, including applying the turret accuracy.
		const projectile = new Projectile(this, x, y);
		projectile.SetAngle(angle - (this.#accuracy / 2) + (Math.random() * this.#accuracy));
		projectile.SetSpeed(this.GetProjectileSpeed());
		
		// Initialise the distance travelled to the distance from the platform to the projectile.
		// This is because turrets measure range from the platform position, but they fire
		// projectiles from the turret image point. Including this distance makes sure the
		// projectile range matches the range measured from the platform.
		const [platformX, platformY] = this.GetPlatform().GetPosition();
		projectile.SetDistanceTravelled(MathUtils.DistanceTo(platformX, platformY, x, y));
		
		// Tell GameServer that this projectile was fired, as it needs to both
		// tick it and send a network event for it.
		gameServer.OnFireProjectile(projectile);
		
		// Update the last fired time so it essentially starts reloading again.
		this.#lastFireTime = gameServer.GetGameTime();
	}
}