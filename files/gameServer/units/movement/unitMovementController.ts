
import { UnitMovementState } from "./unitMovementState.js";
import { UnitMovementStateStopping } from "./stopping.js";
import { UnitMovementStateRotateFirst } from "./rotateFirst.js";
import { UnitMovementStateMoving } from "./moving.js";
import { UnitMovementStateReverse } from "./reverse.js";

import { MovableUnitPlatform } from "../movableUnitPlatform.js";

import * as MathUtils from "../../utils/mathUtils.js";

export type UnitMovementStateType = "" | "stopping" | "rotate-first" | "moving" | "reverse" | "released";

// Map of state strings to state class to create for it.
const STATE_CLASS_MAP = new Map<UnitMovementStateType, { new(...args: any[]): UnitMovementState }>([
	["stopping",		UnitMovementStateStopping],
	["rotate-first",	UnitMovementStateRotateFirst],
	["moving",			UnitMovementStateMoving],
	["reverse",			UnitMovementStateReverse]
]);

// UnitMovementController manages the movement of a MovableUnitPlatform along a path.
// It has different states, each of which is controlled by a dedicated class derived
// from UnitMovementState. So this class mostly manages which state is active and
// also provides some utility methods.
export class UnitMovementController {

	#unitPlatform;			// MovableUnitPlatform this controller is managing
	
	// String of current movement state
	#stateStr: UnitMovementStateType = "";
	// UnitMovementState derived class that manages the current state
	#stateObj: UnitMovementState | null = null;
	// String of next movement state to set (at end of tick)
	#nextStateStr: UnitMovementStateType = "";

	#nextStateArgs: any[] = [];		// Arguments to pass to next state constructor
	#waypoints: number[][] = [];	// Remaining list of positions to move to

	constructor(unitPlatform: MovableUnitPlatform)
	{
		this.#unitPlatform = unitPlatform;
	}
	
	// Called via MovableUnitPlatform's ReleaseMovementController() method
	Release()
	{
		this.#waypoints.length = 0;
	}
	
	GetUnitPlatform()
	{
		return this.#unitPlatform;
	}
	
	GetUnit()
	{
		return this.#unitPlatform.GetUnit();
	}
	
	GetGameServer()
	{
		return this.#unitPlatform.GetGameServer();
	}
	
	GetWaypoints()
	{
		return this.#waypoints;
	}
	
	Stop()
	{
		this.#SetState("stopping");
		this.#waypoints = [];
	}
	
	StartMovingAlongWaypoints(waypoints: number[][])
	{
		this.#waypoints = waypoints;
		this.#SetState("stopping");
	}
	
	// Immediately sets the current state, also releasing and replacing the current state object.
	#SetState(stateStr: UnitMovementStateType, ...args: any[])
	{
		// Release any prior state object
		if (this.#stateObj)
		{
			this.#stateObj.Release();
			this.#stateObj = null;
		}
		
		// Update state string
		this.#stateStr = stateStr;
		
		// If moving to "released" state, then release the entire movement controller
		// as it's no longer needed.
		if (this.#stateStr === "released")
		{
			this.#unitPlatform.ReleaseMovementController();
		}
		else
		{
			// For all other states, look up a state class to create for this state,
			// and if one is found then instatiate it for the state object.
			const StateClass = STATE_CLASS_MAP.get(this.#stateStr);
			if (StateClass)
			{
				this.#stateObj = new StateClass(this, ...args);
			}
		}
	}
	
	// Set the next state to switch to at the end of the current tick. This avoids
	// releasing the current state object while it is still processing in the middle of a tick.
	SetNextState(stateStr: UnitMovementStateType, ...args: any[])
	{
		this.#nextStateStr = stateStr;
		this.#nextStateArgs = args;
	}
	
	Tick(dt: number)
	{
		// Tick the current state object.
		if (this.#stateObj)
		{
			this.#stateObj.Tick(dt);
		}
		
		// If a next state has been set, switch to it now it's at the end of the tick.
		if (this.#nextStateStr)
		{
			this.#SetState(this.#nextStateStr, ...this.#nextStateArgs);
			this.#nextStateStr = "";
			this.#nextStateArgs = [];
		}
	}
	
	// Apply acceleration/deceleration towards the current target speed, and then move the current
	// position according to the current speed.
	StepMovement(dt: number, targetSpeed: number)
	{
		const unitPlatform = this.#unitPlatform;
		
		// Accelerate or brake according to whether the unit is under or over the target speed.
		// If it's exactly at the target speed, set the acceleration to 0, so clients don't keep
		// trying to apply acceleration.
		if (unitPlatform.GetSpeed() < targetSpeed)
			unitPlatform.SetAcceleration(unitPlatform.GetMaxAcceleration());
		else if (unitPlatform.GetSpeed() > targetSpeed)
			unitPlatform.SetAcceleration(-unitPlatform.GetMaxDeceleration());
		else
			unitPlatform.SetAcceleration(0);
		
		// Adjust the speed according to the acceleration.
		// Note that setting the speed merely to apply acceleration does not send a delta update
		// to clients for the unit speed: instead it relies on the client applying the acceleration
		// to adjust the speed itself.
		const acceleration = unitPlatform.GetAcceleration();
		if (acceleration !== 0)
		{
			// End on the exact target speed if the change in acceleration would reach it.
			const speedChange = acceleration * dt;
			if (Math.abs(unitPlatform.GetSpeed() - targetSpeed) <= speedChange)
			{
				unitPlatform.SetSpeed(targetSpeed, false /* sendDelta */);
			}
			else
			{
				unitPlatform.SetSpeed(unitPlatform.GetSpeed() + acceleration * dt, false /* sendDelta */);
			}
		}

		// If moving, apply the movement at the current speed.
		if (unitPlatform.GetSpeed() !== 0)
		{
			// Calculate the distance to move this tick. Note this also takes in to account
			// the current acceleration, but the acceleration must not allow the movement to
			// exceed the maximum speed or go negative.
			const moveDist = MathUtils.Clamp(unitPlatform.GetSpeed() * dt + 0.5 * acceleration * dt * dt,
											 -unitPlatform.GetMaxSpeed() * dt,
											 unitPlatform.GetMaxSpeed() * dt);
			
			// Advance by the move distance on the current angle.
			const [currentX, currentY] = unitPlatform.GetPosition();
			const a = unitPlatform.GetAngle();
			const dx = Math.cos(a) * moveDist;
			const dy = Math.sin(a) * moveDist;
			unitPlatform.SetPosition(currentX + dx, currentY + dy);
		}

		// Once the unit comes to a stop - i.e. the first time the speed reaches 0 after
		// not being 0 - or when it first starts moving - send position and speed delta updates.
		// This ensures the client can correct the resting position of the unit as quickly as
		// possible once it stops, since predicting deceleration is tricky. (Note that the
		// acceleration being set to 0 will already send a delta update for the acceleration change.)
		// This also ensures that starting when stopped due to queuing during movement also
		// promptly updates the client.
		if ((unitPlatform.GetSpeed() === 0 && unitPlatform.GetLastSpeed()) !== 0 ||
			(unitPlatform.GetSpeed() !== 0 && unitPlatform.GetLastSpeed() === 0))
		{
			this.GetUnit().MarkPositionDelta();
			this.GetUnit().MarkPlatformSpeedChanged();
		}
	}
}