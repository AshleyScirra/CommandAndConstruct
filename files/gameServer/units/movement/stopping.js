
import { UnitMovementState } from "./unitMovementState.js";

import * as MathUtils from "../../utils/mathUtils.js";

// UnitMovementStateStopping manages the "stopping" state for UnitMovementController.
// This brings the unit to a halt and then proceeds to the "rotate-first" state.
export class UnitMovementStateStopping extends UnitMovementState {

	constructor(controller)
	{
		super(controller);
	}
	
	Tick(dt)
	{
		const controller = this.GetController();
		const unitPlatform = this.GetUnitPlatform();
		const waypoints = this.GetWaypoints();
		
		// Step movement with a target speed of 0, which will decelerate it to a stop.
		controller.StepMovement(dt, 0);
		
		// Unit has come to a stop
		if (unitPlatform.GetSpeed() === 0)
		{
			// Stop any further acceleration
			unitPlatform.SetAcceleration(0);
			
			// If there is no path, then release the movement controller as there is
			// nothing else to do. (If a path is found the unit will create a new controller.)
			if (waypoints.length === 0)
			{
				controller.SetNextState("released");
			}
			else
			{
				// Otherwise a path has been found, so proceed to next move state.
				controller.SetNextState("rotate-first");
			}
		}
	}
}