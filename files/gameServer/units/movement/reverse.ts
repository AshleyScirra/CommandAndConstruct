
import { UnitMovementController, type UnitMovementStateType } from "./unitMovementController.js";
import { UnitMovementState } from "./unitMovementState.js";

import * as MathUtils from "../../utils/mathUtils.js";

// UnitMovementStateReverse performs a short reverse manoeuvre in the hopes
// that will remove it from a position in which it is stuck.
export class UnitMovementStateReverse extends UnitMovementState {

	#reverseTime = 0.5;			// time in seconds to reverse for
	// next movement state to return to after reversing
	#nextState: UnitMovementStateType = "moving";
	#startTime = 0;				// game time when started reversing
	
	constructor(controller: UnitMovementController, reverseTime: number, nextState: UnitMovementStateType)
	{
		super(controller);
		
		this.#reverseTime = reverseTime;
		this.#nextState = nextState;
		this.#startTime = this.GetGameServer().GetGameTime();
		
		// Set debug state 4 for "reverse"
		this.SetUnitDebugState(4);
	}
	
	Tick(dt: number)
	{
		const controller = this.GetController();
		
		// Check if the unit has finished reversing for the given time. If so, advance
		// to the next state.
		const curTime = this.GetGameServer().GetGameTime();
		if (curTime >= this.#startTime + this.#reverseTime)
		{
			controller.SetNextState(this.#nextState);
			return;
		}
		
		// Step the movement with a target speed of half the maximum speed in reverse.
		const unitPlatform = this.GetUnitPlatform();
		const startingPosition = unitPlatform.SavePosition();
		
		controller.StepMovement(dt, -unitPlatform.GetMaxSpeed() / 2);
		
		// See if it collided with anything. If so revert back to the original position
		// and go directly to the next state anyway, as it can't reverse any further.
		const didCollide = unitPlatform.IntersectsAnyOther();
		if (didCollide)
		{
			unitPlatform.RestorePosition(startingPosition);
			unitPlatform.SetSpeed(0);
			controller.SetNextState(this.#nextState);
			return;
		}
	}
}